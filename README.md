# dsh-resend-mcp

Resend email tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness),
wrapped as an installable DSH bundle.

**Home:** <https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp> ·
**Mirror:** <https://github.com/pvlb-dev/dsh-resend-mcp>

The plugin connects to Resend's hosted MCP server
(`https://mcp.resend.com/mcp`), resolves your API key from the DSH credential
store, and exposes a **curated subset** of Resend's tools as native agent tools
named `mcp__resend__<tool>`. A diagnostic `resend_status` tool reports the
connection, credential reference, and active filter without revealing the key.

> Not affiliated with Resend. Resend and the Resend logo are trademarks of
> their respective owners.

**Status:** v0.1.2 (same code as 0.1.0; documentation only), verified on
2026-10-22 against DSH `0.2.0-rc.2` and Resend's live MCP server: 9 tools
registered from 137 available, and a test email was delivered from
`dsh@pvlb.dev` to `pvlb.dev@gmail.com`. CI runs on Forgejo Actions;
`dsh-resend-mcp` is published on
[npmjs](https://www.npmjs.com/package/dsh-resend-mcp) and in the Forgejo
registry.

## What it looks like

One install command and one credential entry, and the model gets nine
`mcp__resend__*` tools plus a diagnostic. Real output from `resend_status` on
the reference deployment (DSH `0.2.0-rc.2`, Resend MCP server `1.2.1`):

```text
Resend MCP: connected
Endpoint: https://mcp.resend.com/mcp
Namespace: resend
Preset: sending
Credential: RESEND_API_KEY (configured via file)
Tools: 9/137 registered
Registered: create-contact, get-contact, get-email, list-broadcasts,
            list-contacts, list-domains, list-emails, list-templates, send-email
```

The send path is verified end to end: a message sent from `dsh@pvlb.dev`
reported `delivered`, and `mcp__resend__get-email` returned it by its Resend
ID. `mcp__resend__list-domains` confirms the sending domain is verified with
sending enabled.

## Why a subset?

Resend's MCP server currently exposes **137 tools** whose JSON schemas total
roughly **405 KB** — on every model request. Most sessions need a handful of
them. This plugin selects a small, useful preset by default and lets you widen
it explicitly:

| Preset | Tools | Approx. schema size |
|---|---|---|
| `minimal` | `send-email`, `list-emails`, `get-email`, `list-domains` | ~13 KB |
| `sending` *(default)* | minimal + `list-contacts`, `get-contact`, `create-contact`, `list-templates`, `list-broadcasts` | ~26 KB |
| `inbox` | minimal + ten inbox read/thread/draft tools | ~54 KB |
| `full` | every tool the server exposes | ~405 KB today |
| `custom` | whatever `tools` matches | user-controlled |

## Requirements

- Node.js >= 22.6
- DSH `>=0.2.0-rc.1 <0.3.0`
- A Resend account with a verified sending domain and an API key
- `pnpm` available to the DSH Plugin Manager (the profile may need to name its
  absolute path)

## Install

### From npm (recommended)

```bash
dsh plugin --profile web add dsh-resend-mcp
```

The package is public:
<https://www.npmjs.com/package/dsh-resend-mcp>. The DSH Plugin Manager resolves
the plugin's DSH peers from the running installation; its own runtime dependency
(`@modelcontextprotocol/client`) comes from npm.

### From a checkout (development)

```bash
git clone https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp.git
cd dsh-resend-mcp
npm run dev:link          # makes a local ("link:") install importable
dsh plugin --profile web add "$PWD"
```

`npm run dev:link` symlinks the DSH packages this plugin imports into the
gitignored `node_modules/`. It is only needed for `link:` installs; a tarball or
registry install gets its dependencies normally.

### From a packed tarball

```bash
git clone https://git.pvlb.dev/dsh-plugins/dsh-resend-mcp.git
cd dsh-resend-mcp
npm pack
dsh plugin --profile web add ./dsh-resend-mcp-0.1.2.tgz
```

### From the Forgejo registry

The Forgejo registry hosts the same version and is publicly readable, but npm
still needs the `dsh-plugins` registry configured for that install; see
[docs/publishing.md](docs/publishing.md). npm remains the one-command path.

After install, restart or reload the profile if the Plugin Manager reports
`restart-required`.

## Configure the API key

1. Create a key at <https://resend.com/api-keys> with permission to send email
   and read the resources you want the agent to use.
2. Add it to the local credential store, `~/.dsh/.credentials.yaml` (or
   `$DSH_HOME/.credentials.yaml`), under the existing `refs:` map:

   ```yaml
   refs:
     RESEND_API_KEY: re_your_api_key
   ```

   Add the entry; do not replace `version`, `records`, or other refs. The store
   watches the file and reloads it on change, so no restart is needed.
3. Keep the file owner-only. DSH refuses to load a credentials file that group
   or others can read; fix it with
   `chmod 600 ~/.dsh/.credentials.yaml` if necessary.

The key is resolved through `ctx.credentials` at connect time and never written
to configuration, logs, tool output, or the repository.

This deployment's Web UI does not expose a generic credential editor, so
editing the file (or exporting `RESEND_API_KEY` before launching DSH) is the
supported path. The launching environment wins over the file: an exported
variable shadows the stored entry and is reported read-only until you clear it.

To use a different credential reference, set `apiKeyEnv` in the plugin config.

## Verify

Ask the agent to call `resend_status`, then list your domains:

> Use `resend_status` to check the Resend connection, then call
> `mcp__resend__list-domains`.

A healthy result shows the credential as configured, the active preset, the
registered tool names, and your verified domains.

## Configuration

The bundle mounts with `config: {}`. Override fields through your profile's
configuration layer when you need different behavior:

```yaml
- id: dsh-resend-mcp
  name: dsh-resend-mcp
  config:
    preset: sending
    defaultSender: "you@example.com"
```

| Field | Default | Description |
|---|---|---|
| `serverName` | `resend` | Namespace for `mcp__<serverName>__<tool>` |
| `url` | `https://mcp.resend.com/mcp` | Streamable HTTP MCP endpoint |
| `apiKeyEnv` | `RESEND_API_KEY` | Credential reference (never the value) |
| `preset` | `sending` | `minimal`, `sending`, `inbox`, `full`, or `custom` |
| `tools` | `[]` | Allowlist patterns; a non-empty list replaces the preset. `*` is a wildcard |
| `excludeTools` | `[]` | Patterns removed after the preset/allowlist |
| `defaultSender` | `""` | Verified sender address included in prompt guidance |
| `toolCallTimeoutMs` | `60000` | Per-tool-call timeout in milliseconds |
| `startupTimeoutMs` | `30000` | Initial connect and tool-list timeout |
| `failOnStartupError` | `true` | Fail activation instead of keeping `resend_status` with retries |
| `maxInstructionBytes` | `8192` | Bound on optional server instruction text |

Examples:

```yaml
# Only sending + email lookup
config:
  preset: minimal

# Everything, explicitly (large prompt prefix)
config:
  preset: full

# Add inbox reading on top of the default sending preset
config:
  preset: inbox
```

To use an explicit list, set `tools`; it replaces the preset:

```yaml
config:
  tools:
    - send-email
    - list-emails
    - get-email
    - "*-domain"            # list-domains, get-domain, ...
```

## Tools

All MCP-backed tools use the `mcp__resend__` prefix and map 1:1 to Resend's
server tools. The default `sending` preset exposes:

- `mcp__resend__send-email`
- `mcp__resend__list-emails`
- `mcp__resend__get-email`
- `mcp__resend__list-domains`
- `mcp__resend__list-contacts`
- `mcp__resend__get-contact`
- `mcp__resend__create-contact`
- `mcp__resend__list-templates`
- `mcp__resend__list-broadcasts`

Plus the native diagnostic:

- `resend_status` — connection state, credential reference/source, preset,
  registered tools, missing filter patterns, last error. It never prints the key.

Resend's `send-email` requires `to`, `subject`, `text`, `from`, `context`, and
`llm_model`. The plugin's prompt guidance explains this and uses
`defaultSender` when configured.

## Security

- The API key is resolved from DSH credentials at connect/reconnect time.
- Configuration carries only the credential reference, never the value.
- Logs contain counts, names, and error messages — not headers or secrets.
- `resend_status` reports only whether the credential is configured and from
  which layer (`file`, `env`, …).
- The repository test suite includes a secret scan and fails on accidental
  `re_…` keys.

The credential store protects against accidental disclosure, not against a
malicious agent running as the same OS user; see the DSH credentials
documentation for that boundary.

## Development

```bash
npm test             # unit tests, no network/DSH required
npm run check        # syntax checks + tests
npm run dev:link     # before a local-path install
npm run smoke        # real server check; needs RESEND_API_KEY in env
npm run pack:check   # inspect the publish artifact
```

`scripts/smoke.mjs` connects to the real server, prints the tool count and the
selected names (not schemas), and can optionally send a test email with
`--send-to <address>`.

See [AGENTS.md](AGENTS.md) for architecture, deployment facts, and the full
verification checklist, [TASKS.md](TASKS.md) for the backlog, and
[docs/publishing.md](docs/publishing.md) for CI, tagging, and registry setup
(including the Forgejo npm registry).

## Limitations

- Remote Streamable HTTP only; no stdio `resend-mcp` process and no OAuth
  browser flow.
- API-key bearer authentication only.
- DSH validates only its own JSON Schema subset locally. Resend keywords such as
  `format`, `pattern`, `minItems`, and `maxItems` reach the model but are
  enforced by Resend's server.
- Reconnection uses bounded exponential backoff; after the attempt budget the
  tools are unregistered until the plugin reloads or the Host restarts.
- No settings UI yet; configure through YAML.
- The plugin is installed profile-wide, affecting every session in that profile.

## License

Apache-2.0. See [LICENSE](LICENSE).
