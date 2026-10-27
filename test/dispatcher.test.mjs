/**
 * Unit tests for the dispatcher surface. No DSH, no network: every fixture is
 * synthetic except the byte-budget comparison, which uses a generated catalog
 * the size of Resend's real one (137 operations).
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  HELP_MAX_BYTES,
  buildCatalog,
  buildDispatcherDescription,
  compactSchema,
  dispatcherParameters,
  helpParameterSpec,
  helpParameters,
  helpToolName,
  renderCatalog,
  renderHelp,
  shapeOnlySchema,
  suggestOperations,
  summarize,
  unknownOperationError,
  validateOperationArgs,
} from '../lib/dispatcher.js'

/** A small catalog fixture. */
const TOOLS = [
  { name: 'send-email', description: '**Purpose:** Send a transactional email. **Returns:** the email id.' },
  { name: 'list-inboxes', description: 'List the Resend inboxes on the account.' },
  { name: 'search-inbox-threads', description: 'Search threads by text, people and dates.' },
]

test('summarize keeps the first sentence and drops the Purpose prefix', () => {
  assert.equal(summarize(TOOLS[0].description), 'Send a transactional email.')
  assert.equal(summarize(''), '')
  assert.equal(summarize(undefined), '')
})

test('summarize truncates on a word boundary with an ellipsis', () => {
  const long = 'one two three four five six seven eight nine ten eleven twelve'
  const short = summarize(long, 20)
  assert.ok(short.endsWith('…'), short)
  assert.ok([...short].length <= 21, short)
  assert.ok(!short.includes('  '), short)
})

test('buildCatalog sorts by name and drops nameless entries', () => {
  const catalog = buildCatalog(TOOLS)
  assert.deepEqual(catalog.map((entry) => entry.name), ['list-inboxes', 'search-inbox-threads', 'send-email'])
  assert.equal(catalog[2].summary, 'Send a transactional email.')
  assert.deepEqual(buildCatalog([{ name: '' }, { description: 'no name' }]), [])
})

test('renderCatalog emits one line per operation inside a byte budget', () => {
  const catalog = buildCatalog(TOOLS)
  const text = renderCatalog(catalog)
  assert.equal(text.split('\n').length, 3)
  for (const entry of catalog) assert.ok(text.includes(entry.name), entry.name)
  assert.equal(text.split('\n').length, catalog.length, 'no multi-line summaries')
  const capped = renderCatalog(catalog, 40)
  assert.ok(capped.includes('use `resend_help`'), capped)
  assert.ok(Buffer.byteLength(capped, 'utf8') < 200)
})

test('the dispatcher description carries the full operation catalog', () => {
  const catalog = buildCatalog(TOOLS)
  const description = buildDispatcherDescription({ serverName: 'resend', catalog })
  for (const entry of catalog) assert.ok(description.includes(entry.name), entry.name)
  assert.ok(description.includes('resend_help({ operation })'), 'names the help call')
  assert.ok(description.includes('untrusted content'), 'carries the prompt-injection note')
})

test('a 137-operation dispatcher costs far less wire schema than 137 tools', () => {
  const tools = Array.from({ length: 137 }, (_, index) => ({
    name: `operation-${index}`,
    // Roughly the shape of a real Resend description: a purpose sentence plus a
    // paragraph of guidance, so the comparison is not flattered by tiny fixtures.
    description:
      `**Purpose:** Do operation ${index} against Resend. **Returns:** the affected resource. ` +
      'Use this when the user asks for that resource, and prefer the list tool when they only need IDs. ' +
      'Every argument is validated by the server, and the response carries the resource itself.',
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 8 }, (_, field) => [
          `field_${field}`,
          { type: 'string', description: `Argument number ${field} for operation ${index}.` },
        ]),
      ),
      required: ['field_0'],
    },
  }))
  const catalog = buildCatalog(tools)
  const dispatcher = JSON.stringify({
    name: 'resend',
    description: buildDispatcherDescription({ serverName: 'resend', catalog }),
    parameters: dispatcherParameters(),
  })
  const full = JSON.stringify(tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema })))
  assert.ok(dispatcher.length < full.length / 10, `${dispatcher.length} vs ${full.length}`)
  assert.equal(catalog.length, 137)
})

test('parameter schemas require an operation and accept an args object', () => {
  const call = dispatcherParameters()
  assert.deepEqual(call.required, ['operation'])
  assert.equal(call.properties.args.type, 'object')
  assert.equal(call.additionalProperties, false)
  const help = helpParameters()
  assert.deepEqual(Object.keys(help.properties), ['operation'])
  // defineTool takes a property map, so the native help tool declares the same
  // single optional parameter in that dialect.
  assert.deepEqual(Object.keys(helpParameterSpec()), ['operation'])
  assert.equal(helpParameterSpec().operation.type, help.properties.operation.type)
})

test('unknown operations produce suggestions', () => {
  const catalog = buildCatalog(TOOLS)
  assert.deepEqual(suggestOperations('list-inbox', ['list-inboxes', 'send-email']), ['list-inboxes'])
  assert.deepEqual(suggestOperations('totally-unrelated-thing', ['list-inboxes']), [])
  const message = unknownOperationError('list-inbox', catalog)
  assert.match(message, /Unknown Resend operation "list-inbox"/)
  assert.match(message, /list-inboxes/)
  assert.match(message, /resend_help/)
})

test('renderHelp lists the catalog when no operation is named', () => {
  const catalog = buildCatalog(TOOLS)
  const text = renderHelp({ catalog })
  assert.match(text, /Resend operations \(3\)/)
  for (const entry of catalog) assert.ok(text.includes(entry.name))
})

test('renderHelp returns the full description and schema for one operation', () => {
  const catalog = buildCatalog(TOOLS)
  const tool = {
    description: '**Purpose:** Send a transactional email.\n\n**Returns:** the email id.',
    inputSchema: { type: 'object', properties: { to: { type: 'array' } }, required: ['to'] },
  }
  const text = renderHelp({ catalog, operation: 'send-email', toolFor: () => tool })
  assert.match(text, /^# send-email/)
  assert.ok(text.includes('Send a transactional email.'), 'description is verbatim')
  assert.ok(text.includes('"to"'), 'schema is rendered')
  assert.match(text, /resend\(\{ operation: "send-email"/)
})

test('renderHelp degrades a huge schema instead of exceeding the byte budget', () => {
  const catalog = [{ name: 'big', summary: 'Big schema.' }]
  const properties = {}
  for (let index = 0; index < 400; index += 1) properties[`field_${index}`] = { type: 'string', description: 'x'.repeat(60) }
  const tool = { description: 'Big one.\n', inputSchema: { type: 'object', properties } }
  const text = renderHelp({ catalog, operation: 'big', toolFor: () => tool })
  assert.ok(Buffer.byteLength(text, 'utf8') <= HELP_MAX_BYTES, `${Buffer.byteLength(text, 'utf8')} bytes`)
  assert.ok(text.includes('field_0'), 'still names the parameters')
})

test('renderHelp reports unknown operations and a disconnected server', () => {
  const catalog = buildCatalog(TOOLS)
  const unknown = renderHelp({ catalog, operation: 'send-mail' })
  assert.match(unknown, /Unknown operation "send-mail"/)
  assert.match(unknown, /send-email/)
  const offline = renderHelp({ catalog: [], operation: 'send-email' })
  assert.match(offline, /not connected/)
})

test('compact and shape-only schema fallbacks are total', () => {
  assert.equal(compactSchema(undefined), '{}')
  assert.equal(compactSchema({ type: 'object' }), '{"type":"object"}')
  assert.equal(shapeOnlySchema(undefined), '{}')
  assert.equal(
    shapeOnlySchema({ type: 'object', properties: { a: { type: 'string' }, b: { anyOf: [] } }, required: ['a'] }),
    'a: string (required)\nb: anyOf',
  )
})

test('validateOperationArgs catches missing and unknown arguments only', () => {
  const tool = {
    inputSchema: {
      type: 'object',
      properties: { to: { type: 'array' }, subject: { type: 'string' } },
      required: ['to'],
      additionalProperties: false,
    },
  }
  assert.deepEqual(validateOperationArgs(tool, { to: ['a@b.c'] }), { ok: true, errors: [] })
  const missing = validateOperationArgs(tool, { subject: 'hi' })
  assert.equal(missing.ok, false)
  assert.match(missing.errors.join(' '), /missing required argument "to"/)
  const unknown = validateOperationArgs(tool, { to: [], subjekt: 'typo' })
  assert.equal(unknown.ok, false)
  assert.match(unknown.errors.join(' '), /unknown argument "subjekt" \(accepted: to, subject\)/)
})

test('validateOperationArgs leaves combinators and open schemas to the server', () => {
  assert.deepEqual(validateOperationArgs(undefined, { anything: 1 }), { ok: true, errors: [] })
  assert.deepEqual(
    validateOperationArgs({ inputSchema: { anyOf: [{ type: 'object' }] } }, { anything: 1 }),
    { ok: true, errors: [] },
  )
  const open = { inputSchema: { type: 'object', properties: { a: {} }, additionalProperties: true } }
  assert.deepEqual(validateOperationArgs(open, { a: 1, extra: 2 }), { ok: true, errors: [] })
})

test('help tool name derives from the namespace', () => {
  assert.equal(helpToolName('resend'), 'resend_help')
  assert.equal(helpToolName('mail'), 'mail_help')
})
