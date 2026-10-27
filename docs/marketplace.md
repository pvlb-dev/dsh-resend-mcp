# Listing on dsh-plugin.org

The community hub [dsh-plugin.org](https://dsh-plugin.org) indexes public DSH
plugins by GitHub topic and publishes a listing the in-DSH Plugin Hub can
install from. This page records what the hub requires, what this repository
satisfies, the exact submission text, and the outcome — so nobody has to
reconstruct it from memory.

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
| Published to npm (required for the in-DSH Plugin Hub) | Met — `dsh-resend-mcp@0.1.3` |
| Open-source license declared | Met — Apache-2.0 (`LICENSE`, `package.json`, README) |
| No impersonation of the official team | Met — "not affiliated" notes in README |

Quality checklist from the same page (`one-line value`, `copyable install`,
`visible proof`, `clear risk`, `accurate category`, `clear license`): the last
gap was *visible proof*, closed by the README section **What it looks like**,
which shows real `resend_status` output and the verified send path.

## Status: listed 2026-10-25

- Detail page is live and marked **Verified**:
  <https://dsh-plugin.org/plugins/pvlb-dev/dsh-resend-mcp> — category
  *Integrations & Connections*, "Listed on 2026-10-25".
- The submission issue
  [dshplugin/dsh-plugin-hub#429](https://github.com/dshplugin/dsh-plugin-hub/issues/429)
  was closed the same day by maintainer `dshplugin`: the plugin "is already
  indexed in the DSH Plugin Hub catalog", and because the package is on npm the
  in-app Plugin Hub "will also pick up the one-click install entry after the
  next sync".
- **Resolved 2026-10-27.** The fallback was not a sync lag. The hub's in-app
  resolver requires the **npm package's `repository` URL to point at the GitHub
  repo** (plus a `dsh-plugin` keyword or a `dsh` manifest). Source:
  [`src/server/services/install/npm-resolve.ts`](https://github.com/dshplugin/dsh-plugin-hub/blob/main/src/server/services/install/npm-resolve.ts)
  — `isDshPackageMetadataForRepo()` rejects the package when
  `githubRepoOf(repositoryUrl) !== repo`, and its file comment states the rule
  plainly ("包元数据里的 repository 指向该仓库"). Our `repository` pointed at
  `git.pvlb.dev`, so the check failed even though the name matched.
- **Fix:** `package.json` `repository` now points at
  `git+https://github.com/pvlb-dev/dsh-resend-mcp.git` (the mirror), shipped as
  `0.1.4`. `homepage` and `bugs` still point at the Forgejo home, and the README
  still calls Forgejo the home — only the field the resolver reads moved.
- The JSON catalogs carry only one-click (npm) entries: 5,365 entries on
  2026-10-27 against 17,316 repositories in the site's live index. Absence from
  the JSON therefore means "npm install path not resolved", not "not listed".
- **Correction to an earlier claim in this file:** a previous version said the
  hub matched on package name alone, backed by two catalog entries claiming
  `dsh-edit-resend` whose npm package has no `repository` field. That inference
  was wrong — the source above is authoritative, and the catalog is built by a
  different pipeline than the runtime check. Do not remove the GitHub
  `repository` field again.
- If the sync after `0.1.4` still leaves the fallback, comment on hub#429 with
  the `cmd` payload. Do not open a second submission issue.

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
eyeballing the page. The API documents itself at
<https://api.dsh-plugin.org/>: `GET /plugins.{lang}.json` (catalogs),
`GET /stats.json`, `GET /cmd/{owner}/{slug}.json` (install command for one
plugin), `GET /hub.json`, `GET /about.json`.

```bash
# English catalog; plugins.zh.json carries the same entries with zh fields
curl -s https://api.dsh-plugin.org/plugins.en.json | python3 -c '
import json, sys
hits = [p for p in json.load(sys.stdin) if p.get("o") == "pvlb-dev"]
print(json.dumps(hits, ensure_ascii=False, indent=2))'

# once listed, this returns the install command instead of 404
curl -s https://api.dsh-plugin.org/cmd/pvlb-dev/dsh-resend-mcp.json
```

Useful fields per entry: `o` owner, `n` name, `c` category code, `vr` indexed
version, `r.npmPackage` matched npm package, `ic` install command, `v`
(`verified` or `unconfirmed`), `u` last refresh, `a` date added, `sg`/`fk`
stars/forks. The detail page is
<https://dsh-plugin.org/plugins/pvlb-dev/dsh-resend-mcp>.

Expect a delay, and expect two stages. The crawler refreshes on a cycle, not on
demand, and the catalog has been observed lagging npm by more than a day
([dsh-plugin-hub#427](https://github.com/dshplugin/dsh-plugin-hub/issues/427)).
On 2026-10-24 `/stats.json` reported `{"total": 5100, "verified": 5100}` and on
2026-10-26 `{"total": 5245, "verified": 5245}`, while the site's own counter read
17,316 repositories — so the published catalogs only carry the one-click (npm)
subset, all verified. **Absence from the JSON does not mean the submission was
refused**: the website shows the entry first, and the npm resolution that the
next sync performs is what adds it to the catalog and the in-DSH Plugin Hub.

## Post-listing checklist

- [x] Badge added to the README (top line, linking the detail page).
- [x] Documentation release `0.1.3` published so the README on npm matches the
      one the hub shows.
- [x] Listing recorded in `TASKS.md` and in the `AGENTS.md` deployment facts.
- [ ] Hub resolves the install command to
      `dsh plugin --profile web add dsh-resend-mcp` (see *Status* above), at
      which point the entry also appears in `plugins.en.json` and issue #8 can
      close.

After that the hub re-crawls on its own: stars, description, README, and version
follow the repository, so no resubmission is needed for later releases. Keep the
badge in place — it is the cheapest signal that the listing is intentional.
