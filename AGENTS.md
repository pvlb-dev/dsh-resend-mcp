# AGENTS.md — working notes for future agents

This file is for an AI agent (or a human in a hurry) picking up
`dsh-resend-mcp`. Read it before changing `lib/`. It records the goal, the
architecture, how the plugin is installed and verified, and the rules that keep
the project safe and reviewable.

## Orientation — pvlb.dev

This repo lives on the pvlb.dev forge:
<https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp>. Before starting, read the
bootcamp page:
<https://git.pvlb.dev/pvlb-infra/vps-setup/wiki/DSH-Bootcamp> (repos and wikis
are private — a browser `web_fetch` 404s; read it through an SSH clone). It
covers the box, the global `dsh <dsh@pvlb.dev>` GPG-signed commit identity,
`git` vs the `gitea_*` tools, and the house rules.

- Default branch is `master` (`git fetch` before writing; other pvlb repos may
  use `main`).
- Every issue is labeled **at creation** with `type/*`, `area/*` and
  `priority/*`; add `needs-operator` only for work only the operator can do.
  See [Issues, labels, and the Gitea toolset](#issues-labels-and-the-gitea-toolset).
- The `gitea_*` tools have known defects (registry below); prefer `git` over
  SSH for file content.
- The box is small (1.9 GiB RAM) and `workspace-write` forbids `sudo`; ask the
  operator for privileged work.

Project-specific rules below win over the bootcamp page.

## Goal

Make [Resend](https://resend.com)'s hosted MCP server
(`https://mcp.resend.com/mcp`) a first-class, installable DeepSeek Harness
toolset:

- Resend tools appear to the model as `mcp__resend__<tool>`, e.g.
  `mcp__resend__send-email`.
- The API key is read from the DSH credential store (`RESEND_API_KEY` by
  default) and never stored in configuration, code, logs, or git.
- A curated default subset keeps the model-facing tool prefix small — the
  upstream server currently exposes 137 tools whose schemas total ~405 KB.
- A native `resend_status` tool explains connection, credential, and filter
  state without revealing the secret.
- The plugin is installable from a local checkout, a packed tarball, or the
  npm registry, and survives Host restarts through the profile composition.
- Documentation is good enough that someone can install it with one command,
  configure a sender, and send an email without reading source.

The project is deliberately small: **no build step**, plain ESM JavaScript, one
bundle, a handful of focused modules and tests.

## What this repository is (and is not)

- It **is** a DSH profile bundle plus Host plugin. `package.json` declares
  `dsh.bundle.patch`; `cordis.patch.yml` inserts the `dsh-resend-mcp` row.
- It **is not** a fork of Resend's `resend-mcp` package and does not vendor their
  server. It talks to the hosted server over Streamable HTTP using the official
  `@modelcontextprotocol/client` SDK.
- It **is not** affiliated with Resend. Add the usual disclaimer to README
  changes.
- It **does not** implement Resend's REST API directly. Every Resend operation
  goes through the MCP server's own tools, so behavior stays aligned with
  Resend's product.

## Architecture

```
profile bundle row (cordis.patch.yml)
  └─ lib/index.js  apply(ctx, config)
       ├─ ctx.credentials.resolve(config.apiKeyEnv)   // secret stays local
       ├─ lib/bridge.js
       │    ├─ Client + StreamableHTTPClientTransport
       │    │    headers: { Authorization: `Bearer ${key}` }
       │    ├─ listTools()
       │    ├─ lib/selection.js        // presets + glob filter
       │    ├─ createMcpToolDefinition // from @deepseek-ai/dsh-mcp-client
       │    └─ ctx.tools.register(...) // mcp__resend__*
       ├─ resend_status                // native diagnostic tool
       └─ ctx.systemPrompt.section(...) // sender + usage guidance
```

Important properties:

- **Credential resolution happens at connect and at every reconnect.** Rotating
  the key in DSH credentials takes effect on the next reconnect.
- **Tool filtering is a product feature, not a debug knob.** The default preset
  exposes 9 tools; `full` exposes everything and logs a size warning.
- **Definition reuse.** `createMcpToolDefinition` from
  `@deepseek-ai/dsh-mcp-client` provides canonical MCP result values, error
  handling, and durable image projection. Do not reimplement it.
- **Atomic generation swaps.** Build the next tool set fully, then dispose the
  old one and register the new one; roll back the partial generation on
  conflict.
- **SSE/HTTP only.** There is no stdio transport and no OAuth browser flow; the
  remote server accepts an API key as a Bearer token for headless clients.

### Why not a config-only `dsh-mcp-client` row?

A configuration-only bundle would be two files, but it cannot do two things this
product needs:

1. `dsh-mcp-client` takes literal `headers`; it has no way to resolve a
   credential reference at runtime, so the key would have to live in YAML.
2. It registers every tool the server exposes. Resend's 137 tools total ~405 KB
   of schema on every request — a serious context and cost problem.

The native bridge is the smallest design that solves both while reusing the
hard part (MCP result projection) from the shipped client.

## Repository map

| Path | Responsibility |
|---|---|
| `lib/index.js` | Plugin export, `Config`, credential resolution, lifecycle, `resend_status`, prompt wiring |
| `lib/selection.js` | Presets, glob matching, `publicToolName`, `resolveSelection()` (pure) |
| `lib/bridge.js` | MCP client generation, discovery, filtered registration, re-sync, reconnect (no DSH config types) |
| `lib/prompt.js` | Pure prompt-section text builder |
| `test/` | `node:test` units for selection, prompt, manifest, secret scan |
| `scripts/dev-link-dsh.mjs` | Makes a `link:` install importable by symlinking DSH peers and `@modelcontextprotocol/client` |
| `scripts/smoke.mjs` | Standalone real-server check using `RESEND_API_KEY`; no DSH required |
| `cordis.patch.yml` | Bundle row insertion |
| `locale/en.json`, `icon.svg` | Plugin Manager display metadata |
| `.forgejo/workflows/ci.yml` | Tests and `npm pack --dry-run` on master pushes |
| `.forgejo/workflows/publish.yml` | Tag-driven publish to the Forgejo npm registry |
| `.forgejo/workflows/publish-npmjs.yml` | Tag-driven publish to npmjs; no-op without `NPMJS_TOKEN` |
| `AGENTS.md`, `TASKS.md`, `README.md`, `docs/outreach.md` | Working notes, backlog, user docs, outreach |
| `docs/publishing.md` | Release/publish guide written for non-npm people |

## Configuration

Defaults are intentionally deployment-neutral. The installed bundle row uses
`config: {}`; override fields through the profile's configuration layer when
needed.

| Field | Default | Notes |
|---|---|---|
| `serverName` | `resend` | Namespace for `mcp__<serverName>__<tool>` |
| `url` | `https://mcp.resend.com/mcp` | Streamable HTTP endpoint |
| `apiKeyEnv` | `RESEND_API_KEY` | Credential ref; not the value |
| `preset` | `sending` | `minimal`, `sending`, `inbox`, `full`, `custom` |
| `tools` | `[]` | Non-empty replaces the preset; `*` wildcard |
| `excludeTools` | `[]` | Subtracted after preset/allowlist |
| `defaultSender` | `""` | Verified sender used in prompt guidance; not enforced server-side |
| `toolCallTimeoutMs` | `60000` | Per tool call |
| `startupTimeoutMs` | `30000` | Initial connect + list |
| `failOnStartupError` | `true` | Fail activation vs. keep status tool with retries |
| `maxInstructionBytes` | `8192` | Bound on optional server instructions |

Preset contents live in `lib/selection.js`; keep README and `resend_status`
consistent with it.

## Development

Requirements: Node >= 22.6, DSH `>=0.2.0-rc.1 <0.3.0`, `pnpm` available to the
Plugin Manager for installs.

```bash
# unit tests (no DSH or network required)
npm test

# syntax + tests
npm run check

# standalone check against the real Resend server; reads RESEND_API_KEY from env
RESEND_API_KEY=... node scripts/smoke.mjs

# required before a local-path ("link:") install
npm run dev:link
```

`scripts/dev-link-dsh.mjs` symlinks the peers this plugin imports plus
`@modelcontextprotocol/client` from the running DSH installation into
`node_modules/`. `pnpm link:` does not resolve a linked package's own
dependencies, so without this step the Loader fails with a bare-import error.
The script only touches the gitignored `node_modules/`.

### CI and releases

This Forgejo instance has a single-slot `forgejo-runner`; both `docker` and
`ubuntu-latest` labels map to the same `act-22.04` image. See
`docs/publishing.md` for the full release flow and the token setup.

- `.forgejo/workflows/ci.yml` runs `npm run check` and `npm pack --dry-run` on
  pushes to `master` and on manual dispatch. It deliberately has **no
  `pull_request` trigger**: the repository is public, and a fork PR would run
  arbitrary code on the single runner, whose job containers mount the host's
  rootless Docker socket. Test a contributor's branch with `workflow_dispatch`
  only after reviewing it, or locally.
- `.forgejo/workflows/publish.yml` publishes only on `v*` tags, after checking
  that the tag equals `v` + `package.json` version. It reads the Forgejo token
  from the repository secret `NPM_TOKEN` (`write:package` scope); a manual run
  is a dry run. It skips a version that is already in the registry.
- `.forgejo/workflows/publish-npmjs.yml` publishes the same tag to
  `https://registry.npmjs.org` with `NPMJS_TOKEN`, and skips cleanly while that
  secret is absent. The public package is `dsh-resend-mcp`.
- Do not add a `pull_request`/`pull_request_target` trigger or accept outside
  PRs while this instance runs a Docker-socket runner: job containers can reach
  the host and the Forgejo environment (see the runner wiki).

### Install while developing

Prefer the Harness's `plugin_manager` tool with
`action: install_bundle` and the absolute checkout path. It installs the
package, selects the bundle, and applies the patch. Do **not** hand-edit
`$DSH_PROFILE_DIR/package.json` or `cordis.patch.yml`; the Plugin Manager owns
those files.

Command-line equivalents for users:

```bash
# from npm (public)
dsh plugin --profile web add dsh-resend-mcp

# from a checkout
dsh plugin --profile web add /absolute/path/to/dsh-resend-mcp

# from a packed tarball
npm pack
dsh plugin --profile web add ./dsh-resend-mcp-0.1.2.tgz
```

After install, add `RESEND_API_KEY` to the local credential store,
`~/.dsh/.credentials.yaml` (or `$DSH_HOME/.credentials.yaml`), under `refs:`;
the store watches the file and reloads it, so no restart is needed. Keep the
file owner-only (`chmod 600`). An environment variable supplied to the
launching process wins over the file and is read-only in the UI. The Web UI has
no generic credential editor in this deployment.

## Verification

Minimum for any change:

1. `npm run check`
2. `npm pack --dry-run` — package contains `lib/`, `locale/`, `icon.svg`,
   `cordis.patch.yml`, README, LICENSE; no `node_modules`, no secrets.
3. If the change touches the bridge or registration: run the smoke script
   against the real server, then reinstall the bundle and inspect the live tool
   list.
4. If the change touches credentials or logging: run
   `git grep -nE 're_[A-Za-z0-9]{20,}'` and confirm `resend_status` output has no
   value.
5. Do not send test email without checking the recipient; the canonical smoke
   recipient for this repo is `pvlb.dev@gmail.com`, sender `dsh@pvlb.dev`.

Live checks (Host tools):

- `plugin_manager` install result must say `application: applied`.
- `cordis_inspect_query` with `platform: host`, `provider: Tool`,
  `method: listTools` shows `resend_status` and the preset's
  `mcp__resend__*` tools.
- `resend_status` reports the credential as configured, its source (`file`,
  `env`, ...), the preset, and the registered tool names.
- `mcp__resend__list-domains` returns the account's domains.
- A test send returns an email id; `mcp__resend__get-email` confirms it.

## Deployment facts for this checkout

Checked 2026-10-22, updated 2026-10-23:

- DSH `0.2.0-rc.2`, profile `web`, profile directory `$DSH_PROFILE_DIR`.
- Web GUI: `http://127.0.0.1:3080`.
- `pnpm` lives beside the Node binary (for example
  `/opt/node-v24.22.0-linux-x64/bin/pnpm`) and is not on the server's `PATH`;
  the profile patch names it explicitly for Plugin Manager.
- `RESEND_API_KEY` exists in `~/.dsh/.credentials.yaml` under `refs`; the agent
  must never print it.
- `pvlb.dev` is a verified Resend domain with sending enabled.
- The plugin is installed in the `web` profile from npmjs
  (`dsh-resend-mcp@0.1.2`) and selected in `dsh.profile.bundles`. The Host must
  restart to load it; until then the running process still holds the previous
  `link:` code and `resend_status` reports 9/137 tools.
- End-to-end verification on 2026-10-22: `dsh@pvlb.dev` → `pvlb.dev@gmail.com`,
  Resend ID `01a16501-b85e-78b2-8b9c-d905153074b4`, status `delivered`.
- `origin` is `ssh://git@git.pvlb.dev/dsh-plugins/dsh-resend-mcp.git`, default
  branch `master`. The repository is public; the web UI is
  <https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp> and `master` is pushed/mirrored
  to <https://github.com/pvlb-dev/dsh-resend-mcp>.
- Commit identity: `dsh <dsh@pvlb.dev>` (configured in the repo).
- The profile directory is write-protected to the agent's shell; use
  `plugin_manager`, not shell writes, for profile changes.
- Forgejo is 17.0.0. The instance-level `forgejo-runner` exposes the labels
  `docker` and `ubuntu-latest`, runs **one job at a time**, and gives job
  containers `node`, `git`, and Docker access. CI and publish workflows live in
  `.forgejo/workflows/`.
- Publishing to the Forgejo npm registry uses the repository secret
  `NPM_TOKEN` (a user token with `write:package`). Forgejo 17 does not provide a
  `gitea` context, so there is no automatic Actions token. `0.1.0`, `0.1.1`, and
  `0.1.2` were published on 2026-10-23 from tags `v0.1.0` / `v0.1.1` / `v0.1.2`;
  the later two are docs/metadata only. See `docs/publishing.md`.
- `0.1.2` is the latest public release on npmjs (`npm view dsh-resend-mcp
  version` → `0.1.2`). It makes the package metadata point at the public
  Forgejo repo (HTTPS) and corrects the credential instructions. The live `web`
  profile was switched from the `link:` checkout to the npmjs install (now
  `0.1.2`) on 2026-10-23, so the Plugin Manager reports `restart-required`; the
  running process still holds the previously loaded link code until restart.

## Issues, labels, and the Gitea toolset

Labels are **per repository** in Forgejo. Every issue gets three axes at the
moment it is opened — not "later, during triage":

| Axis | Values |
|---|---|
| type | `type/task` (work), `type/bug` (defect) |
| area | `area/dsh` for this repo; `area/host`, `area/backup`, `area/forgejo`, `area/security` only when one fits better |
| priority | `priority/now` (broken or time-boxed), `priority/next` (after current work), `priority/later` (parked) |

- If the priority is unclear use `next`. An unlabeled issue is worse than a
  debatable priority: it disappears from every filter.
- `needs-operator` goes on top **only** when the operator personally must act
  (sudo, physical access, an account, or a decision only he can make). It is
  the label he filters on, so do not put it on agent work.
- The taxonomy and the rules are on the bootcamp page; this section mirrors it.
  Keep the two in sync and put project-specific additions here.

### Labeling an issue (current tooling)

`gitea_issue_create` cannot set labels, assignee or milestone yet
([dsh-gitea#6](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues/6)), so:

1. Create the issue.
2. Get **numeric ids**. `gitea_labels {action: "list"}` currently prints names
   only ([dsh-gitea#7](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues/7)),
   so use `GET /api/v1/repos/<owner>/<repo>/labels?limit=100` with
   `GITEA_TOKEN`.
3. `gitea_labels {action: "set", number, labels: [<ids>]}`.

Names are silently ignored by `action: "set"`; always pass ids.

If the repo lacks the set, create the missing labels with
`gitea_labels {action: "create"}` — **not** `gitea_label_bootstrap`, which
hard-codes the upstream taxonomy and conflicts with the house set
([dsh-gitea#8](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues/8)). Never
label-bomb another project's backlog: rank and propose, the operator decides.

### Known `gitea_*` tool defects

One defect = one issue in
[`dsh-plugins/dsh-gitea`](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues).
The table is a working index; add a row when you find a bug and file the issue
in the same sitting (symptom, observed vs expected, root cause `file:line` when
known, proposed fix, acceptance).

| Symptom | Real behaviour | Workaround | Issue |
|---|---|---|---|
| `gitea_wiki get` → `OK` | Forgejo's API returns page metadata only; the formatter has no wiki branch | clone `ssh://git@git.pvlb.dev/<owner>/<repo>.wiki.git` | [#4](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues/4) |
| `gitea_repo_contents` → filename | formatter returns `data.path`, not the body; `path: ""` errors | `git clone`, or REST `/api/v1/repos/<owner>/<repo>/contents/<path>` with `GITEA_TOKEN` | [#3](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues/3) |
| `gitea_issue_list` with `limit > 20` | formatter slices to 20 rows; the offset still uses `limit`, so page 2 is skipped | always `limit <= 20`, page through | [#2](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues/2) |
| empty result → bare `OK` | "no rows", "done" and "unrecognised" are indistinguishable | verify with a second query or the REST API | [#5](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues/5) |
| `gitea_issue_create` with `labels` | labels/assignee/milestone are dropped; not in the tool schema | create, then `gitea_labels {action: "set"}` with numeric ids | [#6](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues/6) |
| `gitea_labels list` hides ids | formatter prints `name` only; `action: "set"` requires numeric ids | fetch ids from REST `/api/v1/repos/<owner>/<repo>/labels` | [#7](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues/7) |
| `gitea_label_bootstrap` | creates the upstream taxonomy (`status/*`, `scope/*`, …), not the house set | create the house labels by hand; do not bootstrap | [#8](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues/8) |

- The fork we can fix is the checkout at `~/Projects/dsh-gitea`
  (branch `main`); tool fixes belong there, not in this repo.
- The fuller working index lives in
  [`pvlb-infra/issue-tracker/AGENTS.md`](https://git.pvlb.dev/pvlb-infra/issue-tracker/src/branch/master/AGENTS.md)
  under *Tool bugs observed*. Search open issues there before filing a new one:
  the first report (#1) was a consolidated list that had to be split into
  #2–#6.
- For exact bulk reads prefer the REST API over the tools:
  `curl -s -H "Authorization: token $GITEA_TOKEN" ...`. Never print or commit
  the token.

## Conventions

- Plain ESM JavaScript, no TypeScript build step. Keep modules small and pure
  where possible so `node:test` can exercise them without DSH.
- Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ops:`.
- Every user-visible behavior change updates README and `resend_status` if
  relevant.
- Never commit secrets, tokens, `.env` files, or generated tarballs.
- Never log request headers, resolved credentials, or full config objects.
- Keep `TASKS.md` and the Forgejo backlog in sync; link issues by URL. Label
  new issues at creation as described above.
- File a Gitea tool bug when you hit one, and add its row to the table above.
- Use `dsh <dsh@pvlb.dev>` for commits and push only to
  `dsh-plugins/dsh-resend-mcp`.

## Definition of done

- `npm run check` passes.
- The plugin installs and activates in the `web` profile.
- `resend_status` and the default `mcp__resend__*` tools are visible and usable.
- One real email reaches `pvlb.dev@gmail.com` through the installed plugin.
- No secret appears in config, logs, git, or tool output.
- README, AGENTS.md, and TASKS.md describe the current behavior.
- Open follow-ups are recorded as **labeled** Forgejo issues (`type/*`,
  `area/*`, `priority/*`).
- A Gitea tool bug found along the way is filed (one defect per issue) and
  linked from the table above.

## Roadmap and known limits

- `dsh-resend-mcp@0.1.2` is public on npmjs and in the Forgejo registry. The
  source is public at both the Forgejo home and the GitHub mirror, and the
  `repository`/`homepage` fields point at the public Forgejo URL. Forgejo
  installs still need the registry configured and use a downloaded tarball; the
  public install is `dsh plugin --profile web add dsh-resend-mcp`.
- No settings UI; sender/preset are YAML fields.
- No inbox preset enabled by default; it is available as `preset: inbox`.
- Local validation enforces only DSH's JSON Schema subset. Resend keywords such
  as `format`, `pattern`, `minItems`, and `maxItems` reach the model but are
  enforced by the MCP server, not locally.
- Reconnect uses a bounded exponential backoff; after the attempt budget the
  tools are unregistered until the plugin reloads or the Host restarts.
