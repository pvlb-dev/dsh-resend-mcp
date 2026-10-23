# Outreach kit — getting DeepSeek Harness on Resend's MCP page

Status: **draft.** `dsh-resend-mcp@0.1.0` is public on npmjs, so the package
link is usable. A public source mirror is still pending (issue #7); do not link
the private Forgejo repository until it exists.

## What we built

A native DeepSeek Harness plugin for Resend's hosted MCP server:

- Resend's tools appear as first-class agent tools (`mcp__resend__send-email`,
  `mcp__resend__list-domains`, …).
- The API key comes from DSH's credential store, so it never sits in config.
- A curated default toolset avoids the ~405 KB / ~100k-token schema prefix that
  the full 137-tool server would impose.
- A `resend_status` diagnostic reports connection, credential source, and active
  filter without exposing the key.
- Installation is a DSH command; no local MCP process, no OAuth browser dance on
  headless hosts.

## Proposed docs tab

Resend's [MCP Server documentation](https://resend.com/docs/mcp-server) lists
client-specific install tabs. Add one:

```markdown
**DeepSeek Harness**

```bash
dsh plugin --profile web add dsh-resend-mcp
```

Store your Resend API key in **Settings → Credentials** as `RESEND_API_KEY`.
The plugin exposes Resend's MCP tools as `mcp__resend__*` and includes a
`resend_status` check. Package and install notes:
<https://www.npmjs.com/package/dsh-resend-mcp>.
```

## Email draft

Subject: Resend MCP + DeepSeek Harness integration

Hi Resend team,

I built an open-source DeepSeek Harness plugin that wraps your hosted MCP
server (`https://mcp.resend.com/mcp`) as a native toolset. It resolves the
Resend API key from DSH's credential store, exposes a curated subset of your
tools (the full server is 137 tools / ~405 KB of schema, which is a lot to put
in every request), and includes a `resend_status` diagnostic. Installation is
one command:

```bash
dsh plugin --profile web add dsh-resend-mcp
```

DeepSeek Harness is an agent runtime with a plugin/bundle system; your docs
currently cover Claude, Cursor, Codex, OpenCode, and several others, but not
DSH. Would you be open to adding a **DeepSeek Harness** tab to the MCP Server
page? I'm happy to provide the exact snippet, test the setup against your docs,
or open a PR to `resend/resend-skills` if that repo is the right place for
client-specific install notes.

Package: https://www.npmjs.com/package/dsh-resend-mcp

Thanks!
<NAME>

## Checklist before sending

- [x] npm package is reachable without credentials:
      <https://www.npmjs.com/package/dsh-resend-mcp>
- [ ] Public source mirror is reachable (the Forgejo repo is private; issue #7).
      Do not link the private repo in the email.
- [ ] README has a screenshot or a short transcript of a successful send.
- [x] `npm run check` is green, `v0.1.0` is tagged, and the package is on npmjs.
- [x] The install command in the email matches the public artifact.
- [ ] No API keys, account IDs, or private domains appear in the message.
- [ ] Send from a personal address, not the Resend account's transactional
      sender.
