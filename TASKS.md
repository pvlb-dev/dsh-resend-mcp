# TASKS — dsh-resend-mcp

Source-of-truth backlog for this repository. Every open task has a matching
issue in
[`dsh-plugins/dsh-resend-mcp`](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues).
Update this file when a task starts, completes, or changes scope.

Status legend: `open` · `in progress` · `done` · `blocked`

## v0.1.0 — installable plugin

| ID | Task | Status | Issue |
|---|---|---|---|
| T1 | Scaffold bundle manifest, Cordis patch, icon/locale, `.gitignore` | done | — |
| T2 | Write `AGENTS.md`, `TASKS.md`, `README.md`, and `docs/outreach.md` | done | — |
| T3 | Implement config schema, presets, glob selection, and public tool naming | done | — |
| T4 | Implement credential-aware MCP connection, filtered registration, re-sync, reconnect, `resend_status`, prompt section | done | — |
| T5 | Add tests (selection, prompt, manifest, secret scan) plus `dev-link` and `smoke` scripts | done | — |
| T6 | Run syntax/tests/pack checks and a real-server smoke listing | done | — |
| T7 | Install into the `web` profile, verify the live tool list, and send one test email to `pvlb.dev@gmail.com` | done | — |
| T8 | Verify the command-line/tarball install path on a clean profile | in progress (install verified; Host restart pending) | [#5](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/5) |
| T9 | Create Forgejo issues for the backlog and mirror them here | done | — |
| T10 | Commit and push to `dsh-plugins/dsh-resend-mcp` as `dsh <dsh@pvlb.dev>` | done | — |

## Follow-ups

| ID | Task | Status | Issue |
|---|---|---|---|
| F1 | Add a Forgejo Actions workflow for `npm test` and `npm pack` (confirm runner labels first) | done | [#1](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/1) |
| F2 | Publish `dsh-resend-mcp` to npm and create a public mirror for external users | done (0.1.1 on npmjs + Forgejo; mirror split to F6) | [#2](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/2) |
| F3 | Add a settings surface for `defaultSender`, `preset`, and filters | open | [#3](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/3) |
| F4 | Document the inbox preset workflow end to end | open | [#4](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/4) |
| F5 | Send the Resend outreach email and propose a DeepSeek Harness docs tab | ready (npm package is public; mirror still pending) | [#6](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/6) |
| F6 | Create a public source mirror (GitHub/Codeberg) so package metadata links resolve | open | [#7](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/7) |

## Remaining

- #5: restart the Host once so the profile loads the npmjs-installed 0.1.1,
  then confirm `resend_status` and the tools.
- #7: public source mirror so the npm page's repository link resolves.
- #3 and #4: settings surface and inbox workflow docs.
- #6: send the outreach once #7 exists (or link only the npm page).

## Done

| ID | Task | Completed |
|---|---|---|
| — | Repository initialized with Apache-2.0 license and README | 2026-10-22 |
| T1–T7 | v0.1.0 implementation, docs, tests, profile install, and end-to-end test email | 2026-10-22 |
| F1 | Forgejo Actions CI (`check`: tests + pack) green on the `docker` label | 2026-10-23 |
| — | Published `dsh-resend-mcp@0.1.0` to the Forgejo npm registry and created release `v0.1.0` | 2026-10-23 |
| F2 | Published `dsh-resend-mcp@0.1.0` to the public npm registry via tag `v0.1.0` | 2026-10-23 |
| — | Published `0.1.1` (docs-only) to npmjs and Forgejo; release `v0.1.1` | 2026-10-23 |

## Verification notes (2026-10-22 / CI 2026-10-23)

- `npm test`: 27 passing.
- `npm run check`: syntax checks + tests pass.
- `npm pack --dry-run`: 12 files, ~21 KB packed, no secrets or node_modules.
- Standalone smoke: connected to `https://mcp.resend.com/mcp`, server
  `resend 1.2.1`, 137 tools available, `sending` preset selects 9.
- `plugin_manager install_bundle`: `application: applied`; bundle selected in
  the `web` profile, row `dsh-resend-mcp`.
- Live tools: `resend_status` + nine `mcp__resend__*` tools.
- `mcp__resend__list-domains`: `pvlb.dev` verified, sending enabled.
- Test email: `dsh@pvlb.dev` → `pvlb.dev@gmail.com`, Resend ID
  `01a16501-b85e-78b2-8b9c-d905153074b4`, status **delivered**.
- Credential: `RESEND_API_KEY` configured via the `file` source; value never
  printed.
- CI (2026-10-23): Forgejo Actions run for `0c12e12` succeeded (`check`,
  1m24s) on the `docker` label; `npm run check` and `npm pack --dry-run` pass
  on Node 22.6.
- Publish (2026-10-23): tag `v0.1.0` on `98e6e23` published
  `dsh-resend-mcp@0.1.0` to the Forgejo npm registry (`NPM_TOKEN` secret with
  `write:package`); release `v0.1.0 — initial release` created.
- Forgejo does not expose a `gitea` context: an automatic-token attempt was
  rejected by workflow schema validation. The `NPM_TOKEN` secret is required.
- npmjs (2026-10-23): `publish-npmjs.yml` published `dsh-resend-mcp@0.1.0`
  with `NPMJS_TOKEN`; `npm view dsh-resend-mcp version` now returns `0.1.1`
  (docs-only patch, `latest` tag). The downloaded tarball has 12 files and no
  secrets.
- Clean profile (2026-10-23): `DSH_HOME=<tmp> dsh plugin --profile clean add
  dsh-resend-mcp@0.1.0` installed a real 0.1.0 directory from npmjs. Missing
  peers are expected there because no DSH runtime is installed.
- Resolver dry-run: `loadProfileDirectory` + `createRuntimeResolution` reports
  no skipped bundles and supplies `@deepseek-ai/schemastery` 3.18.5,
  `dsh-tools`/`dsh-mcp-client` 0.2.0-rc.2, and `@modelcontextprotocol/client`
  2.0.0 from the installation scope.
- The live `web` profile was switched from the `link:` checkout to the
  npmjs-installed 0.1.1; the Plugin Manager reports `restart-required`.

## Notes

- Do not send test email without confirming the recipient; canonical smoke
  recipient is `pvlb.dev@gmail.com`.
- Do not print, commit, or paste the `RESEND_API_KEY` value.
- Profile changes go through `plugin_manager`; do not hand-edit the profile.
- Close completed issues with a short summary and the commit SHA/link.
