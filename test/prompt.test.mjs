import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildPromptText } from '../lib/prompt.js'

const base = {
  serverName: 'resend',
  preset: 'sending',
  selected: ['send-email', 'list-emails'],
  availableCount: 137,
}

test('prompt names the namespace, preset, and tools', () => {
  const text = buildPromptText(base)
  assert.match(text, /## Resend email tools/)
  assert.match(text, /namespace `resend`/)
  assert.match(text, /Active preset: `sending`/)
  assert.match(text, /2 of 137/)
  assert.match(text, /mcp__resend__send-email/)
})

test('configured sender is stated as the default', () => {
  const text = buildPromptText({ ...base, defaultSender: 'dsh@pvlb.dev' })
  assert.match(text, /Use `dsh@pvlb\.dev` as the `from` address/)
  assert.doesNotMatch(text, /Ask the user for a verified `from`/)
})

test('missing sender asks the model to collect one', () => {
  const text = buildPromptText(base)
  assert.match(text, /Ask the user for a verified `from` address/)
})

test('empty selection is called out instead of pretending tools exist', () => {
  const text = buildPromptText({ ...base, selected: [] })
  assert.match(text, /No Resend tools are currently exposed/)
})

test('tool list is capped with a remainder marker', () => {
  const selected = Array.from({ length: 45 }, (_, index) => `tool-${index}`)
  const text = buildPromptText({ ...base, selected })
  assert.match(text, /\+5 more/)
  assert.match(text, /mcp__resend__tool-39/)
  assert.doesNotMatch(text, /mcp__resend__tool-40/)
})

test('server instructions are included and bounded', () => {
  const text = buildPromptText({ ...base, serverInstructions: 'Use send-email for one-off messages.' })
  assert.match(text, /Resend MCP server instructions/)
  assert.match(text, /Use send-email for one-off messages\./)

  const huge = 'x'.repeat(10_000)
  const capped = buildPromptText({ ...base, serverInstructions: huge, maxInstructionBytes: 100 })
  assert.ok(capped.length < 1_000)
  assert.match(capped, /\[truncated\]/)
})

test('prompt never contains credential-like values', () => {
  const text = buildPromptText({ ...base, defaultSender: 'dsh@pvlb.dev' })
  assert.doesNotMatch(text, /re_[A-Za-z0-9]{8,}/)
})
