# AGENTS.md — working notes for future agents

This file is for an AI agent (or a human in a hurry) picking up
`dsh-resend-mcp`. Read it before changing `lib/`. It records the goal, the
architecture, how the plugin is installed and verified, and the rules that keep
the project safe and reviewable.

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
- The plugin is installable from a local checkout, a packed tarball, or (later)
  the npm registry, and survives Host restarts through the profile composition.
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
| `.forgejo/workflows/ci.yml` | Tests and `npm pack --dry-run` on pushes/PRs |
| `.forgejo/workflows/publish.yml` | Tag-driven publish to the Forgejo npm registry |
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
  pushes to `master` and on pull requests. It needs no secrets and no install
  step; tests are offline.
- `.forgejo/workflows/publish.yml` publishes only on `v*` tags, after checking
  that the tag equals `v` + `package.json` version. It reads the Forgejo token
  from the repository secret `NPM_TOKEN` (`write:package` scope); a manual run
  is a dry run. Publishing to npmjs is still a manual/account task and is
  tracked in issue #2.
- Do not add `pull_request_target`-style workflows or accept outside PRs: job
  containers get the host's rootless Docker socket (see the runner wiki).

### Install while developing

Prefer the Harness's `plugin_manager` tool with
`action: install_bundle` and the absolute checkout path. It installs the
package, selects the bundle, and applies the patch. Do **not** hand-edit
`$DSH_PROFILE_DIR/package.json` or `cordis.patch.yml`; the Plugin Manager owns
those files.

Command-line equivalents for users:

```bash
# from a checkout
dsh plugin --profile web add /absolute/path/to/dsh-resend-mcp

# from a packed tarball
npm pack
dsh plugin --profile web add ./dsh-resend-mcp-0.1.0.tgz

# once a public artifact exists
dsh plugin --profile web add dsh-resend-mcp
```

After install, provide the key in the DSH Web UI: **Settings → Credentials →
`RESEND_API_KEY`**. An environment variable supplied to the launching process
also wins (and is read-only in the UI).

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

Checked 2026-10-22:

- DSH `0.2.0-rc.2`, profile `web`, profile directory `$DSH_PROFILE_DIR`.
- Web GUI: `http://127.0.0.1:3080`.
- `pnpm` lives beside the Node binary (for example
  `/opt/node-v24.22.0-linux-x64/bin/pnpm`) and is not on the server's `PATH`;
  the profile patch names it explicitly for Plugin Manager.
- `RESEND_API_KEY` exists in `~/.dsh/.credentials.yaml` under `refs`; the agent
  must never print it.
- `pvlb.dev` is a verified Resend domain with sending enabled.
- The plugin is installed in the `web` profile as a `link:` dependency and
  selected in `dsh.profile.bundles`; `resend_status` reports 9/137 tools.
- End-to-end verification on 2026-10-22: `dsh@pvlb.dev` → `pvlb.dev@gmail.com`,
  Resend ID `01a16501-b85e-78b2-8b9c-d905153074b4`, status `delivered`.
- `origin` is `ssh://git@git.pvlb.dev/dsh-plugins/dsh-resend-mcp.git`, default
  branch `master`.
- Commit identity: `dsh <dsh@pvlb.dev>` (configured in the repo).
- The profile directory is write-protected to the agent's shell; use
  `plugin_manager`, not shell writes, for profile changes.
- Forgejo is 17.0.0. The instance-level `forgejo-runner` exposes the labels
  `docker` and `ubuntu-latest`, runs **one job at a time**, and gives job
  containers `node`, `git`, and Docker access. CI and publish workflows live in
  `.forgejo/workflows/`.
- Publishing to the Forgejo npm registry uses the repository secret
  `NPM_TOKEN` (a user token with `write:package`). Forgejo 17 does not provide a
  `gitea` context, so there is no automatic Actions token. `dsh-resend-mcp@0.1.0`
  was published on 2026-10-23 from tag `v0.1.0` (commit `98e6e23`), with release
  `v0.1.0 — initial release`; see `docs/publishing.md`.

## Conventions

- Plain ESM JavaScript, no TypeScript build step. Keep modules small and pure
  where possible so `node:test` can exercise them without DSH.
- Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ops:`.
- Every user-visible behavior change updates README and `resend_status` if
  relevant.
- Never commit secrets, tokens, `.env` files, or generated tarballs.
- Never log request headers, resolved credentials, or full config objects.
- Keep `TASKS.md` and the Forgejo backlog in sync; link issues by URL.
- Use `dsh <dsh@pvlb.dev>` for commits and push only to
  `dsh-plugins/dsh-resend-mcp`.

## Definition of done

- `npm run check` passes.
- The plugin installs and activates in the `web` profile.
- `resend_status` and the default `mcp__resend__*` tools are visible and usable.
- One real email reaches `pvlb.dev@gmail.com` through the installed plugin.
- No secret appears in config, logs, git, or tool output.
- README, AGENTS.md, and TASKS.md describe the current behavior.
- Open follow-ups are recorded as Forgejo issues.

## Roadmap and known limits

- `dsh-resend-mcp@0.1.0` is published to the Forgejo npm registry; npmjs and a
  public mirror are still open (issue #2). Installs from Forgejo need a token
  and use a downloaded tarball; public installs still use a path or tarball.
- No settings UI; sender/preset are YAML fields.
- No inbox preset enabled by default; it is available as `preset: inbox`.
- Local validation enforces only DSH's JSON Schema subset. Resend keywords such
  as `format`, `pattern`, `minItems`, and `maxItems` reach the model but are
  enforced by the MCP server, not locally.
- Reconnect uses a bounded exponential backoff; after the attempt budget the
  tools are unregistered until the plugin reloads or the Host restarts.
