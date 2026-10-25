# Outreach kit — getting DeepSeek Harness on Resend's MCP page

Status: **sent 2026-10-24** to `zeno.rocha@resend.com` (the `Reply-To` of Resend's
welcome mail), from `dsh@pvlb.dev` with `Reply-To: pvlb.dev@gmail.com`. Sent
through `dsh-resend-mcp` itself, so the mail doubles as the integration's
end-to-end test. **Answered 2026-10-25: declined for now** — see [Reply](#reply-2026-10-25).

- Resend email ID: `01a16f4f-4b65-7136-bab9-9ab524173982`
- Resend message ID: `010201a16f4f4d3f-d9a71b88-7236-4e02-90f4-4ae07dee947e-000000@eu-west-1.amazonses.com`
- Status on `get-email`: **delivered**
- Threading: `In-Reply-To` / `References` were set to the welcome mail's
  `Message-ID`. The Resend API view does not echo custom headers, so confirm
  threading in the inbox view before trusting it.

The DSH email plugin is not configured on this host (`email_health` reports an
incomplete account), so the draft lives here rather than in a mailbox draft
folder.

## What we built

A native DeepSeek Harness plugin for Resend's hosted MCP server:

- Resend's tools appear as first-class agent tools (`mcp__resend__send-email`,
  `mcp__resend__list-domains`, …).
- The API key comes from DSH's credential store, so it never sits in config.
- A curated default toolset avoids the ~405 KB / ~100k-token schema prefix that
  the full 137-tool server would impose.
- A `resend_status` diagnostic reports connection, credential source, and active
  filter without exposing the key.
- Installation is a DSH command; no local MCP process, no OAuth browser flow on
  headless hosts.

## Who to contact, and why

Checked 2026-10-24:

| Channel | Notes |
|---|---|
| `zeno.rocha@resend.com` | `Reply-To` of the welcome mail, which explicitly invites a reply ("We read and reply to every email"). Founder/CEO, so the right level for a listing request. **Used.** |
| `support@resend.com` | Documented customer-support address (JSON-LD `contactPoint` on <https://resend.com/mcp>, and <https://resend.com/support>). Triaged through their support tool. Fallback if the founder thread goes quiet. |
| <https://resend.com/agents> | Marketing page; no submission form and no public repo behind it. A card there is a human decision. |
| <https://resend.com/docs/mcp-server> | Docs list 15 client tabs (Claude, Copilot, Claude Code, Cursor, Codex, Hermes, Grok Bot, OpenClaw, OpenCode, Antigravity, Gemini CLI, Devin, Zed, Warp, fx). Mintlify-hosted; the tab set is a docs decision. |
| <https://github.com/resend/resend-skills> | Their Agent Plugins repo. Not the right home for a DSH plugin (it packages their own MCP server + skills), but a plausible place for a client-specific note; offered as an option. |

The `agents` page named 19 agents and clients on 2026-10-24; DSH was not among
them, which is the hook the mail uses.

## Sent mail (verbatim)

Subject: `Re: Welcome to Resend!`

```text
Hey Zeno,

Thanks for the welcome mail — and for putting a real human on the reply-to.

Answering your P.S. first: I signed up because I needed an email API for an
agent, not another inbox for a human. New customer, small bill, zero complaints
so far. Resend has been the least annoying part of this stack.

So I returned the favour and wired it into the agent I live in: dsh-resend-mcp,
an open-source (Apache-2.0) DeepSeek Harness plugin for your hosted MCP server.
Resend's tools become native agent tools (mcp__resend__*), the API key is read
from DSH's credential store instead of a config file, and it defaults to a
curated 9-tool subset — the full server is 137 tools and roughly 405 KB of
schema, which is a lot to carry on every single request. `preset: full` is one
line away for anyone who wants everything.

  dsh plugin --profile web add dsh-resend-mcp

Which is really why I'm writing: your agents page lists nineteen agents and
clients, and mine isn't one of them. DSH is an agent runtime with a plugin
system, and this is the first-class way to give it Resend. Would you consider a
card on resend.com/agents and a DeepSeek Harness tab in the MCP Server docs?

I'll write the snippet, test it against your docs, or open a PR to
resend-skills — wherever you'd rather it live. Happy to hand over a full-tool
variant and any source material your team needs, too.

Meta note: this email was written and sent by DSH through that plugin, replying
to your welcome mail — an API-key client, no OAuth window. I'm also the agent
that co-wrote the plugin, so this doubles as the integration's own smoke test.

Cheers,
Deeps
DSH agent at pvlb.dev — co-author of dsh-resend-mcp

Package: https://www.npmjs.com/package/dsh-resend-mcp
Source: https://github.com/pvlb-dev/dsh-resend-mcp

P.S. If Resend ever pays people for nice words about the product, I take
payment in API credits.
```

## Reply (2026-10-25)

Brian, Customer Success Engineer, answered on behalf of Zeno. The thread came
back with `In-Reply-To` pointing at our message id and `References` carrying
both, so the `In-Reply-To`/`References` headers we set did land — Gmail's thread
view on the human side is the only place that was ever in doubt.

> Thanks for building dsh-resend-mcp and for thinking of Resend. We're not adding
> new agents or integrations to the agents page or the MCP Server docs right
> now, so we'll pass on this one.
>
> It sounds like a great addition for your users! Wishing you the best of luck
> with it.

What that means:

- **Not a permanent no.** "Right now" is a timing answer, not a rejection of the
  integration. Do not re-pitch immediately; revisit if they reopen submissions
  or announce a new integrations program.
- **Drop the docs-tab and agents-card asks from the active backlog.** The
  dsh-plugin.org listing ([#8](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/8))
  is the remaining marketplace channel in flight.
- **The thread is warm.** Replies to Resend that have a real reason (an MCP
  behavior that breaks users, a security issue, a new product question) can go
  back into this same thread; it reaches a human who has read our project.
- **They answered on 2026-10-25 to `dsh@pvlb.dev`**, which Namecheap forwards to
  `pvlb.dev@gmail.com`. Making that address readable by the agent is the subject
  of [inbound-mail.md](inbound-mail.md).

## Proposed docs tab (attach if they ask)

Resend's [MCP Server documentation](https://resend.com/docs/mcp-server) lists
client-specific install tabs. Add one:

```markdown
**DeepSeek Harness**

```bash
dsh plugin --profile web add dsh-resend-mcp
```

Store your Resend API key in the DSH credential store (`~/.dsh/.credentials.yaml`,
under `refs: RESEND_API_KEY`).
The plugin exposes Resend's MCP tools as `mcp__resend__*` and includes a
`resend_status` check. Package and install notes:
<https://www.npmjs.com/package/dsh-resend-mcp>. Source:
<https://github.com/pvlb-dev/dsh-resend-mcp>.
```

## Checklist before sending

- [x] npm package is reachable without credentials:
      <https://www.npmjs.com/package/dsh-resend-mcp>
- [x] Public source mirror is reachable:
      <https://github.com/pvlb-dev/dsh-resend-mcp> (home:
      <https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp>).
- [x] README has real output proving a successful send (*What it looks like*).
- [x] `npm run check` is green, `v0.1.2` is tagged, and the package is on npmjs.
- [x] The install command in the mail matches the public artifact.
- [x] No API keys, account IDs, or private domains appear in the message.
- [x] Sent from `dsh@pvlb.dev` (the verified domain's own sender) rather than a
      transactional `onboarding@` address; replies go to `pvlb.dev@gmail.com`.
