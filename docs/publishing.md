# Publishing this plugin

This repository is an npm package (`package.json`) that is also a DSH bundle.
This page explains how releases work, what Forgejo can host, and the one step
that still needs a human: creating a registry token.

Written for people who know Python/pip better than JavaScript/npm.

## npm in one table

| Python | npm / this repo |
|---|---|
| `pyproject.toml` | `package.json` |
| `pip install pkg` | `npm install pkg` |
| PyPI | the npm registry (`registry.npmjs.org`) |
| `python -m build` → wheel | `npm pack` → `dsh-resend-mcp-0.1.0.tgz` |
| `twine upload dist/*` | `npm publish` |
| `pip.conf` | `.npmrc` |
| namespaced packages (none) | scopes, e.g. `@dsh-plugins/name` |
| version in `pyproject.toml` | `version` in `package.json` |

There is no build step here: `npm pack` copies the files listed in `files` in
[`package.json`](../package.json). `npm publish` is `npm pack` plus an upload.
`npm view dsh-resend-mcp` is the equivalent of `pip index versions`.

## Two registries, two different jobs

| Registry | Who can install | Auth | Use |
|---|---|---|---|
| Forgejo | accounts on `git.pvlb.dev` that can read the repo | Forgejo token with `write:package` | internal releases, CI rehearsal |
| npmjs | anyone on the internet | npm account token | public installs, Resend outreach |

**Forgejo does host an npm registry** (Forgejo 17 supports npm, including
unscoped names). The catch: this repository is private, so a package in
`dsh-plugins` is private too. Forgejo publishing is therefore useful for
internal testing and as a release rehearsal, but it does **not** give Resend a
link they can open. A public artifact still means npmjs (or making the
repository public elsewhere).

The npm name `dsh-resend-mcp` was still unclaimed on npmjs when this was
written (2026-10-23). Check again before publishing:
`npm view dsh-resend-mcp --registry https://registry.npmjs.org`.

## Option A — Forgejo registry (works today)

CI publishes a tag automatically through
[`.forgejo/workflows/publish.yml`](../.forgejo/workflows/publish.yml).

### One-time setup (human, ~2 minutes)

1. **Create a token.** Open <https://git.pvlb.dev/user/settings/applications>,
   create an access token named `dsh-resend-mcp publish`, and give it the
   **`write:package`** scope. Copy it once; it is not shown again.
2. **Store it as a repository secret.** Open the repo's
   **Settings → Actions → Secrets**, add `NPM_TOKEN` with that token. This is
   exactly the flow in the
   [runner wiki](https://git.pvlb.dev/pvlb-infra/vps-setup/wiki/Forgejo-Actions-Runner#secrets-and-variables).
3. Nothing else. The workflow does the npm config dance in the job container.

The token belongs to a user account, not to the repository, and it is the
credential that can overwrite package versions. Treat it like a PyPI token.

### Cut a release

```bash
npm version patch        # or minor/major; edits package.json + creates the tag
git push origin master --follow-tags
```

Or tag by hand:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The tag must be `v` + the exact `package.json` version; the workflow fails
early if they differ. Follow the run under **Actions → Publish package**. A
manual **Run workflow** is a dry run and uploads nothing.

### Install from Forgejo

Because the package is unscoped and the profile's npm defaults to npmjs, do not
point the global registry at Forgejo — that would break every other install.
Download the tarball and install that instead:

```bash
npm config set //git.pvlb.dev/api/packages/dsh-plugins/npm/:_authToken "<token>"
npm pack dsh-resend-mcp@0.1.0 --registry https://git.pvlb.dev/api/packages/dsh-plugins/npm/
dsh plugin --profile web add ./dsh-resend-mcp-0.1.0.tgz
```

`npm pack` writes the token to `~/.npmrc`; remove that line when you are done
with `npm config delete //git.pvlb.dev/api/packages/dsh-plugins/npm/:_authToken`.

## Option B — npmjs (needed for outreach)

This still needs a human because it is an account signup, not a technical
blocker.

1. Create an account on <https://www.npmjs.com/signup>, enable 2FA (npm requires
   it for publishing), and verify the email.
2. Create a **granular access token** with read/write access to packages and
   the 2FA-bypass option enabled (required for non-interactive publishes).
3. Add it as the repository secret `NPMJS_TOKEN` (keep the Forgejo token in
   `NPM_TOKEN`). Never reuse one token for both registries.
4. Nothing else: `.forgejo/workflows/publish-npmjs.yml` already publishes on
   `v*` tags to `https://registry.npmjs.org` and skips cleanly while
   `NPMJS_TOKEN` is absent.

After the secret exists, push a new tag (or move the current one). Then the
public install is the one-liner:

```bash
dsh plugin --profile web add dsh-resend-mcp
```

Until that exists, `README.md` and `docs/outreach.md` must not claim a public
install path.

### Why not publish from a laptop?

You can (`npm login && npm publish`), but CI is better: the tag pins the source,
the workflow runs the tests first, and no token sits on a developer machine.
Laptop publishing is fine for the very first version if the CI secret is not set
up yet; the artifact is identical.

## Release checklist

- [ ] `npm run check` is green locally.
- [ ] `package.json` version bumped; `npm pack --dry-run` lists `lib/`,
      `locale/`, `docs/`, `cordis.patch.yml`, `icon.svg`, README, LICENSE.
- [ ] `git tag vX.Y.Z && git push origin vX.Y.Z`.
- [ ] Actions run is green; `npm view dsh-resend-mcp@X.Y.Z` shows the version.
- [ ] Install from the registry on a clean profile (tracked as issue #5).
- [ ] Release notes mention the install command and the credential setup.

## Security rules

- The publish token needs `write:package`; nothing else.
- Never put a token in `package.json`, `.npmrc` in the repo, or a workflow file.
  Secrets go in **Settings → Actions → Secrets**.
- The workflow publishes only on `v*` tags, never on pull requests. The runner
  gives job containers access to the host Docker socket, so untrusted PR code
  must not run there (see the runner wiki).
- Rotate the token if it ever appears in a log or a chat transcript.

## Troubleshooting

- **`Unknown Variable Access gitea` / "the workflow file is not usable"**: this
  Forgejo instance does not expose a `gitea` context, so there is no automatic
  package token. Use the `NPM_TOKEN` secret; it is the supported path (and the
  one the runner wiki describes).
- **`401 Unauthorized`**: the secret is missing, expired, or the token lacks the
  `write:package` scope.
- **`403 Forbidden`**: the token's user cannot write packages under
  `dsh-plugins`.
- **`npm publish` says the version already exists**: Forgejo rejects duplicate
  name+version pairs. Bump `package.json`, or delete the version in the package
  UI before republishing.

## Current status

- CI is green on Forgejo Actions (`check`: `npm run check` + `npm pack
  --dry-run`, Node 22.6, `docker` label).
- Forgejo publishing works: `dsh-resend-mcp@0.1.0` was published on
  2026-10-23 from tag `v0.1.0` using the `NPM_TOKEN` secret. A Forgejo release
  with the same tag exists.
- npmjs publishing is **not** set up; issue
  [#2](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/2) tracks the
  public artifact and mirrors.
