#!/usr/bin/env node
/**
 * Standalone Resend MCP smoke check.
 *
 * Connects to the real MCP server with RESEND_API_KEY from the environment,
 * prints the tool count and the selected tool names (never schemas), and can
 * optionally send one test email.
 *
 * Usage:
 *   RESEND_API_KEY=re_... node scripts/smoke.mjs
 *   RESEND_API_KEY=re_... node scripts/smoke.mjs --requested-to you@example.com
 */

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { resolveSelection } from '../lib/selection.js'

const args = process.argv.slice(2)
const flag = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

const apiKey = process.env.RESEND_API_KEY
if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
  console.error('smoke: RESEND_API_KEY is required in the environment')
  process.exit(2)
}

const preset = flag('--preset') ?? 'sending'
const recipient = flag('--requested-to') ?? flag('--send-to')
const sender = flag('--from') ?? 'dsh@pvlb.dev'
const endpoint = flag('--url') ?? 'https://mcp.resend.com/mcp'

const client = new Client(
  { name: 'dsh-resend-mcp-smoke', version: '0.1.0' },
  { capabilities: {}, versionNegotiation: { mode: 'auto' } },
)
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    }),
  )
  const { tools } = await client.listTools(undefined, { cacheMode: 'refresh' })
  const selection = resolveSelection({
    preset,
    available: tools.map((tool) => tool.name),
  })
  console.log(`connected to ${endpoint}`)
  console.log(`server: ${client.getServerVersion()?.name ?? 'unknown'} ${client.getServerVersion()?.version ?? ''}`.trim())
  console.log(`available: ${tools.length} tools; preset "${preset}" selects ${selection.selected.length}`)
  console.log(`selected: ${selection.selected.join(', ')}`)
  if (selection.missingPatterns.length > 0) console.log(`unmatched: ${selection.missingPatterns.join(', ')}`)

  if (recipient) {
    const result = await client.callTool(
      {
        name: 'send-email',
        arguments: {
          from: sender,
          to: [recipient],
          subject: 'dsh-resend-mcp smoke test',
          text: 'This is a smoke test from the dsh-resend-mcp plugin. If you received it, the toolset works.',
          context: 'Verifying an email toolset installation with a single test message.',
          llm_model: 'deepseek-flash',
        },
      },
      { timeout: 60_000 },
    )
    const text = Array.isArray(result.content)
      ? result.content.map((block) => block?.text ?? '').join('\n')
      : ''
    console.log(`send-email: ${result.isError ? 'error' : 'ok'}`)
    console.log(text.slice(0, 2_000))
  }
  await client.close()
} catch (error) {
  console.error(`smoke: ${error instanceof Error ? error.message : String(error)}`)
  try {
    await client.close()
  } catch {
    /* best effort */
  }
  process.exitCode = 1
}
