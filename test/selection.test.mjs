import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PRESETS, PRESET_NAMES, matchPattern, patternToRegExp, publicToolName, resolveSelection } from '../lib/selection.js'

const ALL = [
  'send-email',
  'list-emails',
  'get-email',
  'list-domains',
  'get-domain',
  'list-contacts',
  'get-contact',
  'create-contact',
  'list-templates',
  'get-template',
  'list-broadcasts',
  'get-broadcast',
  'list-inboxes',
  'get-inbox',
  'list-inbox-threads',
  'get-inbox-thread',
  'list-inbox-thread-emails',
  'get-inbox-thread-email',
  'reply-to-inbox-thread-email',
  'send-new-inbox-email',
  'list-inbox-drafts',
  'get-inbox-draft',
]

test('presets are declared and stable', () => {
  assert.deepEqual(PRESET_NAMES, ['minimal', 'sending', 'inbox', 'full', 'dispatcher', 'custom'])
  assert.equal(PRESETS.minimal.length, 4)
  assert.equal(PRESETS.sending.length, 9)
  assert.equal(PRESETS.inbox.length, 14)
  assert.deepEqual(PRESETS.full, ['*'])
  assert.deepEqual(PRESETS.dispatcher, ['*'])
})

test('minimal selects only the four core tools', () => {
  const { selected } = resolveSelection({ preset: 'minimal', available: ALL })
  assert.deepEqual(selected, ['get-email', 'list-domains', 'list-emails', 'send-email'])
})

test('sending selects the default nine tools in server order', () => {
  const { selected } = resolveSelection({ preset: 'sending', available: ALL })
  assert.deepEqual(selected, [
    'create-contact',
    'get-contact',
    'get-email',
    'list-broadcasts',
    'list-contacts',
    'list-domains',
    'list-emails',
    'list-templates',
    'send-email',
  ])
})

test('inbox includes thread and draft tools', () => {
  const { selected } = resolveSelection({ preset: 'inbox', available: ALL })
  assert.equal(selected.length, 14)
  assert.ok(selected.includes('reply-to-inbox-thread-email'))
  assert.ok(selected.includes('get-inbox-draft'))
})

test('full selects every available tool', () => {
  const { selected } = resolveSelection({ preset: 'full', available: ALL })
  assert.deepEqual(selected, [...ALL].sort())
})

test('an explicit tools list replaces the preset', () => {
  const { selected, patterns } = resolveSelection({
    preset: 'full',
    tools: ['send-email'],
    available: ALL,
  })
  assert.deepEqual(selected, ['send-email'])
  assert.deepEqual(patterns, ['send-email'])
})

test('excludeTools subtracts after the base selection', () => {
  const { selected } = resolveSelection({
    preset: 'minimal',
    excludeTools: ['list-*'],
    available: ALL,
  })
  assert.deepEqual(selected, ['get-email', 'send-email'])
})

test('glob patterns work for prefixes and suffixes', () => {
  assert.ok(matchPattern('list-domains', '*-domain*'))
  assert.ok(matchPattern('send-email', 'send-*'))
  assert.ok(matchPattern('anything', '*'))
  assert.ok(!matchPattern('list-domains', 'list-mail-*'))
})

test('unmatched patterns are reported, not fatal', () => {
  const { selected, missingPatterns, missingExcludePatterns } = resolveSelection({
    tools: ['send-email', 'does-not-exist-*'],
    excludeTools: ['also-absent'],
    available: ALL,
  })
  assert.deepEqual(selected, ['send-email'])
  assert.deepEqual(missingPatterns, ['does-not-exist-*'])
  assert.deepEqual(missingExcludePatterns, ['also-absent'])
})

test('duplicate patterns do not duplicate tools', () => {
  const { selected } = resolveSelection({
    tools: ['send-email', 'send-email', '*-email'],
    available: ALL,
  })
  assert.deepEqual(selected, [
    'get-email',
    'get-inbox-thread-email',
    'reply-to-inbox-thread-email',
    'send-email',
    'send-new-inbox-email',
  ])
})

test('unknown presets and empty patterns throw', () => {
  assert.throws(() => resolveSelection({ preset: 'nope', available: ALL }), /unknown Resend tool preset/)
  assert.throws(() => patternToRegExp(''), /non-empty strings/)
  assert.throws(() => patternToRegExp(42), /non-empty strings/)
})

test('public names are clean for normal MCP names', () => {
  assert.equal(publicToolName('resend', 'send-email'), 'mcp__resend__send-email')
  assert.equal(publicToolName('resend', 'list-inbox-thread-emails'), 'mcp__resend__list-inbox-thread-emails')
})

test('public names are deterministic, bounded, and collision-resistant', () => {
  const long = 'x'.repeat(80)
  const a = publicToolName('resend', long)
  const b = publicToolName('resend', long)
  assert.equal(a, b)
  assert.ok(a.length <= 64)
  assert.match(a, /^[A-Za-z0-9_-]+$/)

  const spaced = publicToolName('resend', 'tool with spaces')
  assert.match(spaced, /^[A-Za-z0-9_-]+$/)
  assert.notEqual(spaced, publicToolName('resend', 'tool-with-spaces'))
})
