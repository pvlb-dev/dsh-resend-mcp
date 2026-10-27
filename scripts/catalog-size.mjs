#!/usr/bin/env node
/**
 * Measure what each tool surface costs on the wire.
 *
 * Connects to the real Resend MCP server with `RESEND_API_KEY` from the
 * environment, then prints — per preset — how many tools it registers and how
 * many bytes their `{name, description, parameters}` definitions serialize to,
 * which is what the model pays on every request. Dispatcher mode is measured as
 * the pair `resend` + `resend_help` covering every operation.
 *
 * Usage:
 *   RESEND_API_KEY=re_... node scripts/catalog-size.mjs
 */

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import {
  buildCatalog,
  buildDispatcherDescription,
  dispatcherParameters,
  helpParameters,
  renderHelp,
} from '../lib/dispatcher.js'
import { resolveSelection } from '../lib/selection.js'

const apiKey = process.env.RESEND_API_KEY
if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
  console.error('catalog-size: RESEND_API_KEY is required in the environment')
  process.exit(2)
}

const client = new Client(
  { name: 'dsh-resend-mcp-catalog-size', version: '0.0.0' },
  { capabilities: {}, versionNegotiation: { mode: 'auto' } },
)

const bytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8')
const kb = (value) => `${(value / 1024).toFixed(1)} KB`

try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://mcp.resend.com/mcp'), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    }),
  )
  const { tools } = await client.listTools(undefined, { cacheMode: 'refresh' })
  const available = tools.map((tool) => tool.name)
  const byName = new Map(tools.map((tool) => [tool.name, tool]))
  const definitionBytes = (tool) =>
    bytes({ name: tool.name, description: tool.description, parameters: tool.inputSchema })

  console.log(`${tools.length} operations available\n`)
  console.log('preset      tools   wire schema')
  for (const preset of ['minimal', 'sending', 'inbox', 'full']) {
    const { selected } = resolveSelection({ preset, available })
    const total = selected.reduce((sum, name) => sum + definitionBytes(byName.get(name)), 0)
    console.log(`${preset.padEnd(11)} ${String(selected.length).padStart(5)}   ${kb(total)}`)
  }

  const catalog = buildCatalog(tools)
  const callTool = bytes({
    name: 'resend',
    description: buildDispatcherDescription({ serverName: 'resend', catalog }),
    parameters: dispatcherParameters(),
  })
  const helpTool = bytes({
    name: 'resend_help',
    description: 'List every Resend operation with a one-line summary, or return one operation.',
    parameters: helpParameters(),
  })
  const dispatcher = callTool + helpTool
  console.log(`${'dispatcher'.padEnd(11)} ${String(2).padStart(5)}   ${kb(dispatcher)}  (${catalog.length} operations)`)
  const full = tools.reduce((sum, tool) => sum + definitionBytes(tool), 0)
  console.log(`\ndispatcher is ${(full / dispatcher).toFixed(1)}x smaller than full\n`)

  console.log('help cost per operation (requested on demand)')
  for (const operation of ['send-email', 'create-automation', 'search-inbox-threads', 'get-inbox-thread-email']) {
    const tool = byName.get(operation)
    if (tool === undefined) continue
    const text = renderHelp({ catalog, operation, toolFor: () => tool })
    console.log(`  ${operation.padEnd(24)} ${kb(Buffer.byteLength(text, 'utf8'))}`)
  }
} finally {
  await client.close()
}
