/**
 * Tool selection and model-facing naming for the Resend MCP plugin.
 *
 * Pure module: no DSH imports, no network, no configuration objects. The plugin
 * entry and the unit tests both use it.
 *
 * @module dsh-resend-mcp/selection
 */

import { createHash } from 'node:crypto'

/** Curated tool sets. Names are Resend MCP raw tool names (hyphenated). */
export const PRESETS = Object.freeze({
  minimal: Object.freeze([
    'send-email',
    'list-emails',
    'get-email',
    'list-domains',
  ]),
  sending: Object.freeze([
    'send-email',
    'list-emails',
    'get-email',
    'list-domains',
    'list-contacts',
    'get-contact',
    'create-contact',
    'list-templates',
    'list-broadcasts',
  ]),
  inbox: Object.freeze([
    'send-email',
    'list-emails',
    'get-email',
    'list-domains',
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
  ]),
  full: Object.freeze(['*']),
  // Dispatcher mode: every operation stays reachable, but the bridge registers
  // one call tool (plus a native help tool) instead of one tool per operation.
  dispatcher: Object.freeze(['*']),
})

/** Preset names accepted by the config schema. */
export const PRESET_NAMES = Object.freeze(['minimal', 'sending', 'inbox', 'full', 'dispatcher', 'custom'])

/**
 * Convert one selection pattern to an anchored regular expression.
 *
 * Only `*` is special; every other character is literal. The match is
 * case-sensitive because MCP tool names are case-sensitive.
 *
 * @param {string} pattern - tool name or glob such as `list-*`.
 * @returns {RegExp} anchored matcher.
 */
export function patternToRegExp(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new TypeError('tool selection patterns must be non-empty strings')
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

/**
 * Test one raw tool name against one pattern.
 *
 * @param {string} name - raw MCP tool name.
 * @param {string} pattern - selection pattern.
 * @returns {boolean} true on match.
 */
export function matchPattern(name, pattern) {
  return patternToRegExp(pattern).test(name)
}

/**
 * Resolve the configured selection into concrete raw tool names.
 *
 * Rules:
 * - A non-empty `tools` list replaces the preset (explicit wins).
 * - `preset: 'full'` selects every available tool.
 * - `excludeTools` subtracts after the base selection.
 * - Selected names are sorted for a deterministic registration order.
 * - Patterns that match nothing are reported, not fatal; the caller decides
 *   whether an empty selection is an error.
 *
 * @param {object} options - selection inputs.
 * @param {string} [options.preset='sending'] - preset name.
 * @param {string[]} [options.tools=[]] - explicit allowlist patterns.
 * @param {string[]} [options.excludeTools=[]] - subtractive patterns.
 * @param {string[]} [options.available=[]] - all raw tool names from the server.
 * @returns {{
 *   selected: string[],
 *   patterns: string[],
 *   missingPatterns: string[],
 *   missingExcludePatterns: string[],
 *   preset: string,
 * }} selection result.
 */
export function resolveSelection({
  preset = 'sending',
  tools = [],
  excludeTools = [],
  available = [],
} = {}) {
  if (!PRESET_NAMES.includes(preset)) {
    throw new TypeError(`unknown Resend tool preset "${preset}" (expected: ${PRESET_NAMES.join(', ')})`)
  }
  const names = [...available].filter((name) => typeof name === 'string' && name.length > 0)
  const patterns = tools.length > 0 ? [...tools] : [...(PRESETS[preset] ?? PRESETS.sending)]
  const allowed = new Set()
  const missingPatterns = []
  for (const pattern of patterns) {
    const matcher = patternToRegExp(pattern)
    let matched = false
    for (const name of names) {
      if (matcher.test(name)) {
        allowed.add(name)
        matched = true
      }
    }
    if (!matched) missingPatterns.push(pattern)
  }
  const missingExcludePatterns = []
  for (const pattern of excludeTools) {
    const matcher = patternToRegExp(pattern)
    let matched = false
    for (const name of names) {
      if (matcher.test(name)) {
        allowed.delete(name)
        matched = true
      }
    }
    if (!matched) missingExcludePatterns.push(pattern)
  }
  // Sort for a deterministic registration order: the server does not promise a
  // stable tools/list order, and a stable order keeps the model-facing tool
  // prefix reusable across reconnects.
  const selected = names.filter((name) => allowed.has(name)).sort()
  return { selected, patterns, missingPatterns, missingExcludePatterns, preset }
}

/** Maximum public tool-name length accepted by the model-facing contract. */
const MAX_PUBLIC_NAME_LENGTH = 64

/** Hex characters appended when normalization changes or truncates a name. */
const HASH_LENGTH = 12

/** Characters outside the model-facing function-name contract. */
const INVALID_NAME_CHARS = /[^A-Za-z0-9_-]/g

/**
 * Derive the deterministic model-facing name for one MCP tool.
 *
 * The clean form is `mcp__<serverName>__<rawName>`. When replacement or
 * truncation is needed, a 12-hex-character SHA-256 suffix of the identity is
 * appended so two distinct tools never collapse into one public name.
 *
 * @param {string} serverName - configured namespace.
 * @param {string} rawName - upstream MCP tool name.
 * @returns {string} public tool name.
 */
export function publicToolName(serverName, rawName) {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(INVALID_NAME_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
  const hash = createHash('sha256')
    .update(`${serverName}\0${rawName}`)
    .digest('hex')
    .slice(0, HASH_LENGTH)
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}
