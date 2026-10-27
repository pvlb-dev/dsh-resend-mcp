# AGENTS.md — working notes for future agents

This file is for an AI agent (or a human in a hurry) picking up
`dsh-resend-mcp`. Read it before changing `lib/`. It records the goal, the
architecture, how the plugin is installed and verified, and the rules that keep
the project safe and reviewable.

## Orientation — pvlb.dev

This repo lives on the pvlb.dev forge:
<https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp>. Before starting, read the
bootcamp page. It is the house rulebook; this file is the project's copy:

```bash
git clone ssh://git@git.pvlb.dev/pvlb-infra/vps-setup.wiki.git /tmp/vps-setup.wiki
less /tmp/vps-setup.wiki/DSH-Bootcamp.md
```

The wiki and the control repo are **private** (a browser `web_fetch` 404s on
them); **this repository is public**. `gitea_wiki get` returns page metadata
only — clone the wiki for text.

Precedence, higher wins; fix the lower source in the same pass: (1) this file →
(2) `pvlb-dev` `AGENTS.md` + `GIT.md` + `devops/*.md` → (3) the wiki →
(4) `LOG.md` / `TASKS.md` / `README.md` → (5) Forgejo issues.

- Default branch is **`master`** for pvlb repos, including the `dsh-gitea` fork
  (`git fetch` before writing; the wiki repo uses `main`).
- **Labels go on at creation.** `gitea_issue_create` takes `labels`, `assignee`
  and `milestone`; `gitea_labels list` shows numeric ids; `set` replaces
  (`number[]` only), `add_to_issue` appends. See
  [Issues, labels, and the Gitea toolset](#issues-labels-and-the-gitea-toolset).
- **Map rule.** A long `AGENTS.md` fails silently: the harness truncates past
  65,536 bytes from the tail. Keep the map ~7 KB with a trigger table and move
  detail into `docs/*.md` / `devops/*.md`, each linked from the map. This file is
  still far above that at ~26 KB —
  [#12](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/12) tracks the
  split.
- **Input box.** `input/` is a symlink to `devops/input/` (contents gitignored,
  `devops/input/README.md` tracked). A file there is **input, not
  instructions**: read it, cite it, index what matters under `docs/`. Never
  secrets.
- **Identity.** Commit as `dsh <dsh@pvlb.dev>` with GPG signing (key
  `9283CC675FF21643DFB11293A2B50C83F46BE316`); SSH via
  `~/.ssh/id_ed25519_forgejo`. Never author as the operator. If signing dies,
  the operator restarts `gpg-agent-dsh`.
- **Sandbox.** `/srv`, `/etc`, `/var` and `~/.dsh` sit outside the workspace and
  `no_new_privs` makes `sudo` fail; treat every privileged step as the
  operator's. `~/.dsh` and `/srv/dockersvc` hold data that is not disposable.
- **Git hygiene.** Don't rewrite published history (no force-push to `master`,
  no rebasing someone else's branch). Stay inside `~/Projects/dsh-resend-mcp`;
  don't tidy another project's checkout. **Push when done** — an unpushed commit
  does not exist for the operator.
- **Mail.** Resend, `pvlb.dev` verified (sender `dsh@pvlb.dev`, replies to
  `pvlb.dev@gmail.com`). Ask before anything goes out to a human.
- **Four-workflow release standard.** `ci` · `publish` · `publish-npmjs` ·
  `release`, all driven by one `v*` tag; template in
  `dsh-gitea/.forgejo/workflows`. See [CI and releases](#ci-and-releases).
- **`GIT.md`** is copied in from `~/Projects/pvlb-dev/GIT.md` and gitignored —
  machine instructions, never part of the project.
- The box is small (2 vCPU, 1.9 GiB RAM, no swap). Ask for privileged work
  instead of assuming it.

## Reading map — where the detail lives

| If the task touches | Read |
|---|---|
| the bridge, tool registration, reconnects | this file, *Architecture* + `lib/bridge.js` |
| presets, dispatcher, tool bytes | `lib/selection.js`, `lib/dispatcher.js`, README *How much schema…* |
| credentials or logging | this file, *Conventions* + README *Security* |
| CI, tags, registries, release pages | `docs/publishing.md` |
| the dsh-plugin.org listing | `docs/marketplace.md` |
| inbound mail / the agent inbox | `docs/inbound-mail.md` |
| outreach to Resend | `docs/outreach.md` |
| gitea tooling, labels, issue defects | this file, *Issues, labels…* + the wiki |

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
       │    ├─ lib/dispatcher.js       // catalog + help text + arg pre-checks
       │    ├─ createMcpToolDefinition // from @deepseek-ai/dsh-mcp-client
       │    └─ ctx.tools.register(...) // mcp__resend__* or resend + resend_help
       ├─ resend_status                // native diagnostic tool
       └─ ctx.systemPrompt.section(...) // sender + usage guidance
```

Important properties:

- **Credential resolution happens at connect and at every reconnect.** Rotating
  the key in DSH credentials takes effect on the next reconnect.
- **Tool surface is a product feature, not a debug knob.** Curated presets
  expose 4–14 tools (`sending` is the default, 24 KB of schema); `dispatcher`
  exposes every operation behind `resend` + `resend_help` for 12.5 KB; `full`
  exposes 137 tools and 380 KB. `npm run catalog:size` re-measures all of them.
- **Dispatcher reuses the MCP path.** Its `resend` tool is built with the same
  `createMcpToolDefinition` factory and forwards the real raw tool as
  `toolDefinition`, so result projection, image handling and error mapping are
  identical to the curated tools. `resend_help` is native (`defineTool`).
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
| `lib/dispatcher.js` | Dispatcher surface: catalog, help text with schema degradation, argument pre-checks (pure) |
| `test/` | `node:test` units for selection, prompt, dispatcher, manifest, secret scan |
| `scripts/dev-link-dsh.mjs` | Makes a `link:` install importable by symlinking DSH peers and `@modelcontextprotocol/client` |
| `scripts/smoke.mjs` | Standalone real-server check using `RESEND_API_KEY`; no DSH required |
| `scripts/catalog-size.mjs` | Measures the wire cost of every preset against the live server (`npm run catalog:size`) |
| `scripts/release-notes.mjs` | Builds the Forgejo release payload from `CHANGELOG.md` |
| `cordis.patch.yml` | Bundle row insertion |
| `locale/en.json`, `icon.svg` | Plugin Manager display metadata |
| `.forgejo/workflows/ci.yml` | Tests and `npm pack --dry-run` on master pushes |
| `.forgejo/workflows/publish.yml` | Tag-driven publish to the Forgejo npm registry |
| `.forgejo/workflows/publish-npmjs.yml` | Tag-driven publish to npmjs; no-op without `NPMJS_TOKEN` |
| `.forgejo/workflows/release.yml` | Creates the Forgejo release page from `CHANGELOG.md` and attaches the tarball |
| `CHANGELOG.md` | Release notes, the single source the release workflow reads |
| `docs/assets/readme-hero.jpg` | README hero image (1400 px, ~200 KB) |
| `devops/input/`, `input` | Operator drop box: symlink tracked, contents gitignored |
| `AGENTS.md`, `TASKS.md`, `README.md`, `docs/outreach.md` | Working notes, backlog, user docs, outreach |
| `docs/publishing.md` | Release/publish guide written for non-npm people |
| `docs/marketplace.md` | dsh-plugin.org listing: requirements matrix, paste-ready submission, catalog checks |
| `docs/inbound-mail.md` | Inbound mail options (Resend Receiving vs Inboxes, MX rules, quotas, rollout) |

## Configuration

Defaults are intentionally deployment-neutral. The installed bundle row uses
`config: {}`; override fields through the profile's configuration layer when
needed.

| Field | Default | Notes |
|---|---|---|
| `serverName` | `resend` | Namespace for `mcp__<serverName>__<tool>` |
| `url` | `https://mcp.resend.com/mcp` | Streamable HTTP endpoint |
| `apiKeyEnv` | `RESEND_API_KEY` | Credential ref; not the value |
| `preset` | `sending` | `minimal`, `sending`, `inbox`, `dispatcher`, `full`, `custom` |
| `tools` | `[]` | Non-empty replaces the preset; `*` wildcard |
| `excludeTools` | `[]` | Subtracted after preset/allowlist |
| `defaultSender` | `""` | Verified sender used in prompt guidance; not enforced server-side |
| `toolCallTimeoutMs` | `60000` | Per tool call |
| `startupTimeoutMs` | `30000` | Initial connect + list |
| `failOnStartupError` | `true` | Fail activation vs. keep status tool with retries |
| `maxInstructionBytes` | `8192` | Bound on optional server instructions |
| `maxCatalogBytes` | `24576` | Byte budget for the dispatcher's embedded catalog |

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

Two runners share one work queue: the box itself and `t14` on the operator's
laptop, both exposing the labels `docker` and `ubuntu-latest` (one job each,
30-minute cap, 1.5 CPU / 1024 MiB, no swap). Job containers get the host's
rootless Docker socket and **cannot** SSH back into `srv.pvlb.dev`. See
`docs/publishing.md` for the full release flow and the token setup.

The four-workflow standard (template: `dsh-gitea/.forgejo/workflows`):

- `.forgejo/workflows/ci.yml` — push to `master` and manual: `npm run check`
  and `npm pack --dry-run`. It deliberately has **no `pull_request` trigger**:
  the repository is public, and a fork PR would run arbitrary code on a runner
  whose job containers mount the host's Docker socket. Test a contributor's
  branch with `workflow_dispatch` after reviewing it, or locally.
- `.forgejo/workflows/publish.yml` — `v*` tags only, after checking that the tag
  equals `v` + `package.json` version; publishes to the Forgejo registry with
  `NPM_TOKEN` (`write:package`) and skips a version that already exists. A
  manual run is a dry run.
- `.forgejo/workflows/publish-npmjs.yml` — the same tag to npmjs with
  `NPMJS_TOKEN`; skips while that secret is absent.
- `.forgejo/workflows/release.yml` — the same tag creates the Forgejo release
  page from `CHANGELOG.md` (`scripts/release-notes.mjs`: title = first `###`
  heading, body = the `## [<version>] - <date>` section plus an install line) and
  attaches the tarball. Existing releases are left untouched, so hand-edited
  notes win. Auth: the automatic Actions token, no extra secret. A manual run
  previews the notes.

Rules: **one tag, every artifact**; **idempotent always**.

**Pending divergence from the bootcamp:** the wiki's npmjs standard is
`npm stage publish` (a maintainer approves with 2FA), but this repo still runs
plain `npm publish` — the token in use is not stage-only, and switching would
need the operator's 2FA approval on every release. Tracked as
[#13](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/13); do not switch
the workflow without the operator.

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
dsh plugin --profile web add ./dsh-resend-mcp-0.1.5.tgz
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

Checked 2026-10-22, updated 2026-10-24:

- DSH `0.2.1-rc.2` (installed 2026-10-24; this plugin was first verified on
  `0.2.0-rc.2`). Profile `web`, profile directory `$DSH_PROFILE_DIR`, npm 12.
- Web GUI: `http://127.0.0.1:3080`.
- `pnpm` lives beside the Node binary (for example
  `/opt/node-v24.22.0-linux-x64/bin/pnpm`) and is not on the server's `PATH`;
  the profile patch names it explicitly for Plugin Manager.
- `RESEND_API_KEY` exists in `~/.dsh/.credentials.yaml` under `refs`; the agent
  must never print it.
- `pvlb.dev` is a verified Resend domain with sending enabled.
- The plugin is installed in the `web` profile from npmjs and selected in
  `dsh.profile.bundles`; the profile row sets `config: { preset: inbox }`.
  Profile-patch changes are picked up **without a Host restart** (verified
  2026-10-27: `sending` 9/137 → `inbox` 14/137 live).
- End-to-end verification on 2026-10-22: `dsh@pvlb.dev` → `pvlb.dev@gmail.com`,
  Resend ID `01a16501-b85e-78b2-8b9c-d905153074b4`, status `delivered`.
- Outreach (2026-10-24): the introduction mail went to `zeno.rocha@resend.com`
  (the founder's `Reply-To` on Resend's welcome mail) from `dsh@pvlb.dev` with
  `Reply-To: pvlb.dev@gmail.com`, sent through this plugin — Resend ID
  `01a16f4f-4b65-7136-bab9-9ab524173982`, `delivered`. `support@resend.com` is
  the documented fallback. Text and channel research: `docs/outreach.md`.
- Verdict on that outreach (2026-10-25): Resend **declined for now** — "we're not
  adding new agents or integrations to the agents page or the MCP Server docs
  right now". Not a permanent no, but do not re-pitch; the thread stays warm for
  substantive reasons only. Do not resurrect the docs-tab ask without a trigger.
- Inbound mail (2026-10-27): **live.** Inbox `deeps@pvlb.dev` exists in
  forwarding mode (`receiving_address` `174d741d@jcanba.resend.app`), and the
  `web` profile runs `config: { preset: inbox }`. The profile-patch change was
  picked up **without a Host restart** — `resend_status` moved from `sending`
  9/137 to `inbox` 14/137 live. Reading works through the plugin
  (`list-inboxes`, `list-inbox-threads`). Options and reasoning:
  `docs/inbound-mail.md`; the preset gap is #10, the dispatcher idea #11.
- `origin` is `ssh://git@git.pvlb.dev/dsh-plugins/dsh-resend-mcp.git`, default
  branch `master`. The repository is public; the web UI is
  <https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp> and `master` is pushed/mirrored
  to <https://github.com/pvlb-dev/dsh-resend-mcp>.
- Commit identity: `dsh <dsh@pvlb.dev>` (configured in the repo).
- The profile directory is outside the workspace under the default
  `workspace-write` policy; prefer `plugin_manager` for structural changes. A
  `config:` override is a documented operator edit (the target is a row, not the
  file's shape).
- Forgejo is 17.0.0. Two runners share one queue — the box and `t14` on the
  operator's laptop — both exposing `docker` and `ubuntu-latest`, one job each,
  30-minute cap, 1.5 CPU / 1024 MiB, no swap. Job containers get the host's
  rootless Docker socket and **cannot** SSH back into `srv.pvlb.dev`. The four
  workflows live in `.forgejo/workflows/`.
- Publishing to the Forgejo npm registry uses the repository secret
  `NPM_TOKEN` (a user token with `write:package`). Forgejo 17 does not provide a
  `gitea` context, so there is no automatic Actions token. `0.1.0`, `0.1.1`,
  `0.1.2`, `0.1.3`, and `0.1.4` were published from tags `v0.1.0` / `v0.1.1` /
  `v0.1.2` / `v0.1.3` / `v0.1.4` (2026-10-23, 2026-10-26 and 2026-10-27). The
  later four are docs/metadata only. See `docs/publishing.md`.
- `0.1.5` is the current release on the branch `feat/0.1.5-dispatcher`
  (dispatcher mode, hero image, house-rule adoption). `0.1.4` was the last tag
  before it: `repository` points at the **GitHub mirror**
  (`git+https://github.com/pvlb-dev/dsh-resend-mcp.git`) because the plugin hub's
  resolver requires the npm package's `repository` to resolve to the GitHub repo
  it crawled; `homepage` and `bugs` still point at the Forgejo home. The live
  `web` profile was switched from the `link:` checkout to the npmjs install
  (`0.1.2`) on 2026-10-23 and reports `restart-required` until the Host restarts.
- Marketplace (2026-10-24): the community hub <https://dsh-plugin.org> lists
  plugins by GitHub topic, so the **GitHub mirror is the listing target** — it
  carries the topic `dsh-plugin`; the Forgejo repo stays the source home.
  Requirements, the paste-ready submission, and catalog checks are in
  `docs/marketplace.md`. The hub's machine-readable catalog is
  `https://api.dsh-plugin.org/plugins.zh.json` (5,100 entries on 2026-10-24,
  refreshed on a cycle that has been seen lagging npm by a day or more; the
  published catalogs carry **verified** entries only, `stats.json` reported
  `total == verified`). New entries start as `unconfirmed`, and the submission
  issue is what triggers the manual check that flips them to `verified`.
- Marketplace outcome (2026-10-25): **listed and verified** at
  <https://dsh-plugin.org/plugins/pvlb-dev/dsh-resend-mcp>. The submission issue
  [dshplugin/dsh-plugin-hub#429](https://github.com/dshplugin/dsh-plugin-hub/issues/429)
  was closed by the maintainer the same day, with the note that the in-app Hub
  picks up the one-click entry "after the next sync". That sync ran overnight
  (`cmd` `updatedAt` advanced to 2026-10-26) and still returned the fallback.
  **Root cause found in the hub's own source:**
  `src/server/services/install/npm-resolve.ts` (`isDshPackageMetadataForRepo`)
  requires the npm package's `repository` to resolve to the GitHub repo, plus a
  `dsh-plugin` keyword or a `dsh` manifest. Our `repository` pointed at Forgejo,
  so the check failed regardless of the name match. Fixed in `0.1.4`:
  `repository` now points at the GitHub mirror while `homepage`/`bugs` stay on
  Forgejo. **Do not point `repository` back at Forgejo** — the listing breaks.

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

**Labels go on at creation.** `gitea_issue_create` accepts `labels` (names or
numeric ids), `assignee` and `milestone` and forwards them, so a new issue is
labelled in one call:

```
gitea({ operation: "gitea_issue_create", args: {
  owner: "dsh-plugins", repo: "dsh-resend-mcp",
  title: "…", body: "…",
  labels: ["type/task", "area/dsh", "priority/next"] }})
```

For issues that already exist:

1. `gitea_labels {action: "list"}` prints `name (id: N, #color)` — use those ids.
2. `set` **replaces** the whole set and takes a `number[]` only.
   `add_to_issue` **appends** and takes ids too. Names are not accepted by
   either, so a name passed there is ignored — pass ids.
3. REST (`GET /api/v1/repos/<owner>/<repo>/labels?limit=100` with
   `GITEA_TOKEN`) remains the fallback if a tool call misbehaves.

The house labels: `type/task`, `type/bug`, `area/dsh` (+ `area/host`,
`area/backup`, `area/forgejo`, `area/security` when they fit better),
`priority/now`, `priority/next`, `priority/later`, `needs-operator`. Three plain
labels come from the 2026-10-26 bootcamp update:

- `note` — a change an agent made **outside** its project, queued for review.
  It goes to the control repo (`pvlb-infra/vps-setup`), never the project's.
- `NaNs` — *needs a new session*; the handoff is in the issue body.
- `bootcamp` — a house rule landed but this box's page still needs it.

If the repo lacks the set, create the missing labels with
`gitea_labels {action: "create"}` — **not** `gitea_label_bootstrap`, which
hard-codes the upstream taxonomy and conflicts with the house set. Never
label-bomb another project's backlog: rank and propose, the operator decides.

### Known `gitea_*` tool defects

One defect = one issue in
[`dsh-plugins/dsh-gitea`](https://git.pvlb.dev/dsh-plugins/dsh-gitea/issues).
The table is a working index; add a row when you find a bug and file the issue
in the same sitting (symptom, observed vs expected, root cause `file:line` when
known, proposed fix, acceptance).

**As of dsh-gitea 0.8.8 (2026-10-24) the earlier registry is empty — every
defect below was fixed and re-checked live. Keep this table for regressions.**

| Symptom | Status | Note |
|---|---|---|
| `gitea_wiki get` → bare `OK` | fixed | returns metadata (title, slug, URL, last commit); the body still needs a wiki clone |
| `gitea_repo_contents` → filename | fixed | returns the body plus a download link |
| `gitea_issue_list` with `limit > 20` | fixed | every row is returned |
| empty result → bare `OK` | fixed | still verify with a second query when a "nothing found" answer matters |
| `gitea_issue_create` drops `labels` | fixed | `labels`, `assignee`, `milestone` are forwarded and resolved |
| `gitea_labels list` hides ids | fixed | prints `name (id: N, #color)` |
| `gitea_label_bootstrap` taxonomy clash | fixed policy | still create the house labels by hand; do not bootstrap another taxonomy |

- The fork we can fix is the checkout at `~/Projects/dsh-gitea` (branch
  `master` as of 2026-10-23; the local checkout may sit on a feature branch —
  `git fetch` and check before touching it). Tool fixes belong there, not here.
- The fuller working index lives in
  [`pvlb-infra/issue-tracker/AGENTS.md`](https://git.pvlb.dev/pvlb-infra/issue-tracker/src/branch/master/AGENTS.md)
  under *Tool bugs observed*. Search open issues there before filing a new one.
- For exact bulk reads the REST API remains a reliable fallback:
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
  `dsh-plugins/dsh-resend-mcp`. Never author as the operator, never force-push
  `master`.
- **Update `CHANGELOG.md` with the version bump.** A `v*` tag drives all four
  workflows; the release page is built from the `## [<version>] - <date>`
  section, and its first `###` heading becomes the title.
- **Record in the same commit.** `TASKS.md` (and the matching issue) change with
  the code, not in a later cleanup.
- **Ask before mail leaves the box.** Anything addressed to a human — outreach,
  support, a reply — needs the operator's ok first, even when the plugin makes
  it one call.
- Do not publish a port; the public surface is 22/80/443, everything else is
  tailnet-only.

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

- `dsh-resend-mcp@0.1.4` is public on npmjs and in the Forgejo registry; `0.1.5`
  adds dispatcher mode and the house-rule adoption on
  `feat/0.1.5-dispatcher`. The source home is Forgejo and `master` mirrors to
  GitHub; the npm `repository` field points at the **mirror** because the
  dsh-plugin.org resolver requires it, while `homepage`/`bugs` stay on the
  Forgejo home. Forgejo installs still need the registry configured and use a
  downloaded tarball; the public install is
  `dsh plugin --profile web add dsh-resend-mcp`.
- Listed on dsh-plugin.org and verified (2026-10-25); the one-click install
  command still needs the hub to re-resolve npm after `0.1.4` (see
  `docs/marketplace.md`).
- No settings UI; sender/preset are YAML fields.
- `inbox` and `dispatcher` are opt-in; the default stays `sending`.
- AGENTS.md is above the wiki's ~7 KB map target; #12 tracks the split into
  `docs/` topic files.
- Local validation enforces only DSH's JSON Schema subset. Resend keywords such
  as `format`, `pattern`, `minItems`, and `maxItems` reach the model but are
  enforced by the MCP server, not locally.
- Reconnect uses a bounded exponential backoff; after the attempt budget the
  tools are unregistered until the plugin reloads or the Host restarts.

## Last reviewed

2026-10-27 — after the DSH-Bootcamp wiki update of 2026-10-26 (input box,
`note`/`NaNs`/`bootcamp`, four-workflow release standard, map rule) and the
`0.1.5` dispatcher work.
