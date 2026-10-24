# Listing on dsh-plugin.org

The community hub [dsh-plugin.org](https://dsh-plugin.org) indexes public DSH
plugins by GitHub topic and publishes a listing the in-DSH Plugin Hub can
install from. This page records what the hub requires, what this repository
already satisfies, and the exact submission text — so the submission is a
copy-paste, not a rewrite.

Requirements source: <https://dsh-plugin.org/submit#requirements> (read
2026-10-24).

## Requirement matrix

| Requirement | State |
|---|---|
| Public repository the crawler can read | Met — <https://github.com/pvlb-dev/dsh-resend-mcp> is public (`private: false`) |
| GitHub topic `dsh-plugin` | Met — set 2026-10-24 (`topics.names == ["dsh-plugin"]`) |
| README contains `dsh plugin --profile web add <package>` | Met — README *Install* section |
| Plugin exports an `apply(ctx)` module | Met — `lib/index.js` |
| Root `package.json` with name and version | Met |
| Published to npm (required for the in-DSH Plugin Hub) | Met — `dsh-resend-mcp@0.1.2` |
| Open-source license declared | Met — Apache-2.0 (`LICENSE`, `package.json`, README) |
| No impersonation of the official team | Met — "not affiliated" notes in README |

Quality checklist from the same page (`one-line value`, `copyable install`,
`visible proof`, `clear risk`, `accurate category`, `clear license`): the last
gap was *visible proof*, closed by the README section **What it looks like**,
which shows real `resend_status` output and the verified send path.

## Two repositories, one listing target

The source home is the Forgejo repo
<https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp>; the GitHub repository is its
push mirror (`master` mirrors automatically on push). The hub only crawls
GitHub topics, so **the GitHub mirror is the listing target** — its README,
root `package.json`, topics, and license are what the scanner reads. Keep both
in sync by pushing to `origin`; never edit the mirror directly.

## Submitting

Open a new issue on <https://github.com/dshplugin/dsh-plugin-hub/issues/new>,
pick the plugin-submission template, and paste the title and body below. The
hub also offers a Chinese template at <https://dsh-plugin.org/zh/submit>; the
English text is accepted as-is.

Title:

```text
[Plugin submission] pvlb-dev/dsh-resend-mcp — Resend email tools curated to 9 tools instead of 137
```

Body:

````markdown
### Repository
https://github.com/pvlb-dev/dsh-resend-mcp

### One-line value
Send and read email from the agent through Resend's hosted MCP server — nine curated `mcp__resend__*` tools instead of the server's full 137-tool, ~405 KB schema.

### Category
Integrations & Connections

### Install command
dsh plugin --profile web add dsh-resend-mcp

### Compatibility
DSH `>=0.2.0-rc.1 <0.3.0` (verified on `0.2.0-rc.2`); Node.js >= 22.6; plain ESM with no build step; no native modules, so no platform-specific code. Tested on Linux.

### License
Apache-2.0

### Screenshots / demo
Real `resend_status` output and the verified send path are in the README, section "What it looks like": https://github.com/pvlb-dev/dsh-resend-mcp#what-it-looks-like

### Notes
- External service: connects to `https://mcp.resend.com/mcp` over Streamable HTTP with an API-key Bearer token. No other network access, no telemetry, no filesystem access.
- Credential: the Resend API key is resolved from the DSH credential store (`RESEND_API_KEY` by default) at connect time; it is never written to configuration, logs, or tool output.
- Scope: registers a curated subset by default (9 of the server's 137 tools) to keep the prompt prefix small. `preset: full` exposes everything.
- The source home is a Forgejo repository; this GitHub repository is its push mirror, which is why the package metadata points at git.pvlb.dev.
- Not affiliated with Resend or with DeepSeek AI.

### Pre-submission checklist
- [x] Repository is public
- [x] GitHub topic `dsh-plugin` added
- [x] README includes the install command
- [x] Plugin exports an `apply(ctx)` module
- [x] Repository root includes a `package.json`
````

## Verifying the listing

The hub serves a machine-readable catalog, which is a better check than
eyeballing the page:

```bash
curl -s https://api.dsh-plugin.org/plugins.zh.json | python3 -c '
import json, sys
hits = [p for p in json.load(sys.stdin) if p.get("o") == "pvlb-dev"]
print(json.dumps(hits, ensure_ascii=False, indent=2))'
```

Useful fields per entry: `o` owner, `n` name, `c` category code, `vr` indexed
version, `r.npmPackage` matched npm package, `ic` install command, `v`
(`verified` or `unconfirmed`), `u` last refresh, `a` date added, `sg`/`fk`
stars/forks. The detail page is
<https://dsh-plugin.org/plugins/pvlb-dev/dsh-resend-mcp> (404 until listed).

Expect a delay: the crawler refreshes on a cycle, not on demand, and the
catalog has been observed lagging npm by more than a day
([dsh-plugin-hub#427](https://github.com/dshplugin/dsh-plugin-hub/issues/427)).
Every new listing starts as `unconfirmed` and becomes `verified` after a manual
check, which the submission issue triggers.

## After the listing appears

1. Add the badge to the README, replacing the slug once the detail URL
   resolves:

   ```markdown
   [![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/pvlb-dev/dsh-resend-mcp)
   ```

2. Publish a documentation release (`0.1.3`) so the README on npm matches the
   one the hub shows.
3. Record the listing in `TASKS.md` and the deployment facts in `AGENTS.md`,
   and close the marketplace issue.

The hub re-crawls on its own after that: stars, description, README, and version
follow the repository, so no resubmission is needed for later releases.
