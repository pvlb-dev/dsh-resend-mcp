/**
 * Model-facing guidance for the Resend toolset.
 *
 * Pure module: builds prompt text from state that contains no secrets. The
 * caller registers it as a DSH system-prompt section.
 *
 * @module dsh-resend-mcp/prompt
 */

/** Maximum number of exposed tool names listed verbatim before truncating. */
const MAX_LISTED_TOOLS = 40

/**
 * Truncate text to a UTF-8 byte budget without splitting a code point.
 *
 * @param {string} text - candidate text.
 * @param {number} maxBytes - positive byte budget.
 * @returns {string} original or a byte-bounded prefix.
 */
function capBytes(text, maxBytes) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return ''
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
  let end = Math.min(text.length, maxBytes)
  while (end > 0 && Buffer.byteLength(text.slice(0, end), 'utf8') > maxBytes) end -= 1
  return `${text.slice(0, end).trimEnd()}\n[truncated]`
}

/**
 * Build the Resend system-prompt section.
 *
 * @param {object} state - non-secret runtime state.
 * @param {string} state.serverName - configured namespace.
 * @param {string} state.preset - active preset name.
 * @param {string[]} state.selected - raw tool names currently exposed.
 * @param {number} state.availableCount - number of tools the server exposes.
 * @param {string} [state.defaultSender] - configured verified sender.
 * @param {string} [state.serverInstructions] - optional server-provided text.
 * @param {number} [state.maxInstructionBytes=8192] - server-instruction budget.
 * @returns {string} rendered prompt section.
 */
export function buildPromptText({
  serverName,
  preset,
  selected,
  availableCount,
  defaultSender = '',
  serverInstructions = '',
  maxInstructionBytes = 8192,
}) {
  const tools = Array.isArray(selected) ? selected : []
  const listed = tools.slice(0, MAX_LISTED_TOOLS).map((name) => `mcp__${serverName}__${name}`)
  const more = tools.length > MAX_LISTED_TOOLS ? ` (+${tools.length - MAX_LISTED_TOOLS} more)` : ''
  const sender = typeof defaultSender === 'string' ? defaultSender.trim() : ''
  const lines = [
    '## Resend email tools',
    '',
    `Resend's hosted MCP server is connected through the DeepSeek Harness plugin \`dsh-resend-mcp\` as namespace \`${serverName}\`.`,
    `Active preset: \`${preset}\`; ${tools.length} of ${availableCount} server tools are exposed${more}.`,
  ]
  if (tools.length > 0) lines.push(`Exposed tools: ${listed.join(', ')}.`)
  else lines.push('No Resend tools are currently exposed; call `resend_status` for diagnostics.')
  if (sender) {
    lines.push(
      `Use \`${sender}\` as the \`from\` address for outgoing mail unless the user explicitly asks for a different verified sender.`,
    )
  } else {
    lines.push(
      'Ask the user for a verified `from` address before sending mail; do not invent one. Configure `defaultSender` to make it automatic.',
    )
  }
  lines.push(
    "Resend's `send-email` tool requires `to`, `subject`, `text`, `from`, `context`, and `llm_model`; `context` is a short third-person purpose and `llm_model` is the agent's model identifier.",
    'Call `resend_status` when a Resend tool is missing, the connection looks unhealthy, or the user wants to know which tools are active.',
  )
  const instructions = typeof serverInstructions === 'string' ? serverInstructions.trim() : ''
  if (instructions) {
    lines.push('', '### Resend MCP server instructions', '', capBytes(instructions, maxInstructionBytes))
  }
  return lines.join('\n')
}
