# Inbound mail for the agent

Goal: give DSH an address it can actually read, without the Gmail OAuth/IMAP
detour. The DSH email plugin is unconfigured on this host and its Gmail path is
the fragile part (`email_health` asks for an IMAP host and an app password);
Resend's MCP server, which this plugin already speaks, exposes inbox tools
natively.

Researched 2026-10-24 against <https://resend.com/docs>. Nothing here is
implemented yet — the DNS and dashboard steps are the operator's.

## Two different products

Resend separates them, and the difference matters:

| | **Receiving** | **Inboxes** |
|---|---|---|
| What it is | Inbound mail for a domain, delivered to *your* webhook | A hosted mailbox Resend stores, threads, and organizes |
| Where content lives | Your endpoint + the API (`/emails/receiving`) | Resend (threads, labels, drafts, folders, spam) |
| Setup | Receiving MX on the domain | Verified domain + receiving, **or** `forwarding: true` |
| Good for | App ingestion pipelines | An agent that reads and replies like a person |

Docs: [Receiving](https://resend.com/docs/dashboard/receiving/introduction) ·
[Inboxes](https://resend.com/docs/dashboard/inboxes/introduction).

Inboxes are the right shape here: "AI agent email" is literally one of the
listed use cases, and the MCP server exposes them. Our `inbox` preset already
maps them:

`list-inboxes`, `get-inbox`, `list-inbox-threads`, `get-inbox-thread`,
`list-inbox-thread-emails`, `get-inbox-thread-email`,
`reply-to-inbox-thread-email`, `send-new-inbox-email`, `list-inbox-drafts`,
`get-inbox-draft`.

`reply-to-inbox-thread-email` is the piece the IMAP tools never give us: a reply
that stays in the thread, headers and all.

## The MX constraint

- MX records only affect the name they are attached to, so `pvlb.dev` and
  `agents.pvlb.dev` can point at different mail servers.
- Resend needs its receiving MX to be **the lowest priority value** for the
  domain; a higher-priority (larger number) MX elsewhere wins and Resend sees
  nothing.
- Two MX records with the same priority do not duplicate delivery — one is
  chosen at random per attempt.
- Therefore the apex cannot be split between Namecheap forwarding and Resend.
  It is one or the other.

Source: [Avoid MX conflicts](https://resend.com/docs/knowledge-base/how-do-i-avoid-conflicting-with-my-mx-records).

## The forwarding escape hatch

Creating an inbox with `forwarding: true` makes Resend provision a
`receiving_address` (see [Create Inbox](https://resend.com/docs/api-reference/inboxes/create-inbox));
the domain then only needs DKIM and SPF verified, no receiving MX. You forward
your existing mailbox to that address and the forwarded mail arrives as inbox
threads.

That is what makes this cheap for us: `pvlb.dev` is already verified for
sending, and Namecheap already forwards everything to `pvlb.dev@gmail.com`. We
do not have to touch MX at all.

## Options

| | Setup | Address | Cost / risk |
|---|---|---|---|
| **A. Inbox in forwarding mode** | Create inbox `deeps@pvlb.dev` with forwarding; point a Namecheap rule at its `receiving_address` | `deeps@pvlb.dev` — canonical | No MX change; one extra hop (Namecheap → Resend); catch-all stays pointed at Gmail. **Start here.** |
| **B. Move the apex MX to Resend** | Replace Namecheap's `eforward` MX with Resend's receiving MX; enable receiving; create inboxes | `deeps@pvlb.dev` | Direct delivery and webhooks, but **all** `@pvlb.dev` mail leaves Namecheap: the human path must be rebuilt (auto-forward worker calling the receiving `forward` helper, or living in the Resend dashboard). Unknown aliases silently break. |
| **C. Dedicated receiving subdomain** | Add e.g. `agents.pvlb.dev` as a second verified domain, receiving MX there, inbox on it | `deeps@agents.pvlb.dev` | Direct delivery, fully isolated from existing mail; uses one of the 3 free domain slots; the address is less canonical and replies from it look different. |
| **D. Managed `<id>.resend.app`** | Use the Resend-managed domain shown in the Receiving tab | `<name>@<id>.resend.app` | Zero DNS work; good for a throwaway test, ugly for real correspondence. |

## Quotas and price

- **3 inboxes included on every plan**; extra inboxes are $1/month each on paid
  plans (free accounts cannot buy more).
- **3 verified domains** on the free plan, so option C fits without upgrading.
- **Received mail counts against the email quota** like sent mail: free plan is
  100/day and 3,000/month, and the daily cap is a UTC calendar day.

## Recommended rollout: A now, C only if the hop hurts

1. Resend dashboard → **Inboxes** → **Create inbox**, address `deeps@pvlb.dev`,
   enable forwarding. Copy the `receiving_address` (also readable as
   `receiving_address` from `get-inbox` once the `inbox` preset is on).
2. Namecheap → **Mail Settings → Email Forwarding**: add a mailbox rule
   `deeps` → that `receiving_address`. Leave the catch-all pointing at
   `pvlb.dev@gmail.com`; specific rules take precedence.
3. Switch the plugin to the inbox preset — **done 2026-10-27.** The profile row is
   `config: { preset: inbox }` in `~/.dsh/profiles/web/cordis.patch.yml`, and the
   running Host picked it up **without a restart**: `resend_status` went from
   `Preset: sending, 9/137` to `Preset: inbox, 14/137` live, and the new tools
   appeared in the session.
4. Verify: send a message to `deeps@pvlb.dev` from Gmail, then `list-inboxes` →
   `list-inbox-threads` → `get-inbox-thread-email`. Reply with
   `reply-to-inbox-thread-email` and confirm it lands in the same thread.

Step 3 is the only part that touches DSH configuration. Until the settings
surface from [#3](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/3)
exists, it is a YAML edit in the profile, not a UI toggle.

## State on 2026-10-27

- Inbox `deeps@pvlb.dev` created 2026-10-26 23:26Z in forwarding mode; its
  `receiving_address` is `174d741d@jcanba.resend.app`, and mail reaches it (a
  Gmail forwarding request was waiting for confirmation in the inbox).
- Reading works through the plugin: `list-inboxes` reports the inbox with its
  unread count, `list-inbox-threads` lists the two threads with subjects,
  senders, folders and read state.
- The `inbox` preset exposes 14 tools but misses several a real mailbox needs —
  `search-inbox-threads`, `forward-inbox-thread-email`, `update-inbox-thread`,
  the draft lifecycle, and labels. That gap is
  [#10](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/10); the
  dispatcher idea in
  [#11](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/11) may make the
  preset question moot.

## Security note

Inbound mail is untrusted input, and now it lands directly in a context the
agent reads. Treat bodies, subjects, and attachment names as data — never as
instructions. The plugin's prompt section should say this explicitly once an
inbox is in use; that belongs with the inbox docs in
[#4](https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp/issues/4).

## Open questions

- Does a Namecheap per-mailbox rule coexist cleanly with the catch-all? Expected
  yes (specific rule wins), but verify on first real delivery.
- Do we also want a Gmail mirror of the agent inbox? That needs either a second
  forwarding target (Namecheap allows one per rule) or a worker that calls the
  receiving `forward` helper. Option A deliberately skips it: the human surface
  becomes the Resend dashboard.
