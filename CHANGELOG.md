# Changelog

All notable changes to `dsh-resend-mcp` are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

A `v*` tag drives four workflows: tests (`ci.yml`), the Forgejo registry
(`publish.yml`), npmjs (`publish-npmjs.yml`), and the release page built from
this file (`release.yml`, via `scripts/release-notes.mjs`). The first `###`
heading of a version's section becomes the release title.

## [0.1.5] - 2026-10-27

### Dispatcher mode: every operation behind two tools

The new `preset: dispatcher` registers one call tool (`resend`) and one help tool
(`resend_help`) instead of one model-facing tool per operation. The call tool's
description carries a one-line-per-operation catalog; the help tool returns one
operation's description and JSON schema on demand, degrading the schema instead
of clipping it.

Measured against the live server on 2026-10-27:

| Surface | Tools | Wire schema |
|---|---|---|
| `minimal` | 4 | 12.8 KB |
| `sending` (default) | 9 | 24.2 KB |
| `inbox` | 14 | 51.3 KB |
| `full` | 137 | 380.6 KB |
| `dispatcher` | 2 | **12.5 KB** |

That is 30x smaller than `full` and smaller than the `inbox` preset while
covering all 137 operations.

Also in this release:

- **Local argument pre-checks.** A dispatcher call with a missing required
  argument or an unknown argument fails before the network round trip, and the
  error names the accepted arguments. Types, formats and combinators stay with
  the MCP server, whose validation is authoritative.
- **`args` as a JSON string is parsed** instead of silently dropped.
- **Analytics fields are filled.** Resend requires `context` and `llm_model` on
  every call; the dispatcher fills them when the operation's schema requires
  them, so the model does not restate two fields per operation.
- **A hero image** in the README.
- **House-rules adoption:** `CHANGELOG.md`, the four-workflow release standard,
  the `input/` drop box, and a refreshed `AGENTS.md` for DSH 0.2.1-rc.2 and the
  two-runner CI.

## [0.1.4] - 2026-10-27

### npm repository points at the mirror

`repository` in `package.json` now resolves to the GitHub mirror
(`git+https://github.com/pvlb-dev/dsh-resend-mcp.git`) instead of the Forgejo
home. The dsh-plugin.org resolver requires the npm package's `repository` to
resolve to the crawled GitHub repo (`npm-resolve.ts`,
`isDshPackageMetadataForRepo`), plus a `dsh-plugin` keyword or a `dsh` manifest;
with Forgejo in that field the listing stayed on the `github:` install fallback.
`homepage` and `bugs` still point at the Forgejo home.

## [0.1.3] - 2026-10-26

### Listed on dsh-plugin.org

The plugin is listed and verified on the community hub, category
*Integrations & Connections*: <https://dsh-plugin.org/plugins/pvlb-dev/dsh-resend-mcp>.
This release adds the README badge and listing link, plus `docs/marketplace.md`
with the requirement matrix, the submission text, and the catalog checks.

## [0.1.2] - 2026-10-23

### Public metadata and credential docs

Package metadata points at the public Forgejo repository, and the credential
instructions describe the real mechanism (the `refs:` map in
`$DSH_HOME/.credentials.yaml`, `chmod 600`, auto-reload, environment
precedence) instead of a settings UI this deployment does not have. The shipped
bundle patch comment was corrected in the same spirit.

## [0.1.1] - 2026-10-23

### npm install docs

Corrected the README install section so the npm one-liner is the primary path,
with the checkout and tarball paths documented as alternatives.

## [0.1.0] - 2026-10-23

### First release

- Credential-aware bridge to Resend's hosted MCP server
  (`https://mcp.resend.com/mcp`) over Streamable HTTP.
- Curated presets (`minimal`, `sending`, `inbox`, `full`) behind a glob
  allowlist and subtractive excludes, with model-facing names
  `mcp__resend__<tool>`.
- A native `resend_status` diagnostic that never prints the key.
- System-prompt guidance for sender, tool usage and reconnects.
- Unit tests (selection, prompt, manifest, secret scan), a standalone smoke
  script, Forgejo Actions CI, and tag-driven publishing to the Forgejo registry
  and npmjs.
