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
| T8 | Verify the command-line/tarball install path on a clean profile | open | [#5](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/5) |
| T9 | Create Forgejo issues for the backlog and mirror them here | done | — |
| T10 | Commit and push to `dsh-plugins/dsh-resend-mcp` as `dsh <dsh@pvlb.dev>` | done | — |

## Follow-ups

| ID | Task | Status | Issue |
|---|---|---|---|
| F1 | Add a Forgejo Actions workflow for `npm test` and `npm pack` (confirm runner labels first) | in progress | [#1](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/1) |
| F2 | Publish `dsh-resend-mcp` to npm and create a public mirror for external users | in progress (Forgejo registry wired; npmjs account still needed) | [#2](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/2) |
| F3 | Add a settings surface for `defaultSender`, `preset`, and filters | open | [#3](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/3) |
| F4 | Document the inbox preset workflow end to end | open | [#4](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/4) |
| F5 | Send the Resend outreach email and propose a DeepSeek Harness docs tab | blocked (needs public artifact) | [#6](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/6) |

## Done

| ID | Task | Completed |
|---|---|---|
| — | Repository initialized with Apache-2.0 license and README | 2026-10-22 |
| T1–T7 | v0.1.0 implementation, docs, tests, profile install, and end-to-end test email | 2026-10-22 |

## Verification notes (2026-10-22)

- `npm test`: 27 passing.
- `npm run check`: syntax checks + tests pass.
- `npm pack --dry-run`: 11 files, ~18 KB packed, no secrets or node_modules.
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

## Notes

- Do not send test email without confirming the recipient; canonical smoke
  recipient is `pvlb.dev@gmail.com`.
- Do not print, commit, or paste the `RESEND_API_KEY` value.
- Profile changes go through `plugin_manager`; do not hand-edit the profile.
- Close completed issues with a short summary and the commit SHA/link.
