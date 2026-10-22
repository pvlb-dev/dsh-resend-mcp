/**
 * dsh-resend-mcp — Resend email tools for DeepSeek Harness.
 *
 * Resolves the Resend API key from the DSH credential store, connects to
 * Resend's hosted MCP server, and exposes a filtered set of its tools as
 * `mcp__resend__*` with a native `resend_status` diagnostic.
 *
 * @module dsh-resend-mcp
 */

import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client'
import { createBridge } from './bridge.js'
import { buildPromptText } from './prompt.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-resend-mcp'

/** Services required before this plugin can activate. */
export const inject = ['tools', 'credentials', 'systemPrompt']

/**
 * Plugin configuration. Every field has a safe default so the bundle row can
 * mount with `config: {}`.
 */
export const Config = z.object({
  serverName: z
    .string()
    .default('resend')
    .pattern(/^[A-Za-z0-9_-]{1,32}$/)
    .description('Namespace for the model-facing tools (mcp__<serverName>__<tool>).'),
  url: z
    .string()
    .default('https://mcp.resend.com/mcp')
    .description("Resend's Streamable HTTP MCP endpoint."),
  apiKeyEnv: z
    .string()
    .role('credential-ref')
    .default('RESEND_API_KEY')
    .pattern(/^[A-Za-z_][A-Za-z0-9_]*$/)
    .description('DSH credential reference holding the Resend API key (never the value).'),
  preset: z
    .string()
    .default('sending')
    .pattern(/^(minimal|sending|inbox|full|custom)$/)
    .description('Curated tool preset. A non-empty `tools` list replaces it.'),
  tools: z
    .array(String)
    .default([])
    .description('Explicit tool allowlist patterns; `*` is a wildcard. Non-empty replaces the preset.'),
  excludeTools: z
    .array(String)
    .default([])
    .description('Tool patterns removed after the preset/allowlist is applied.'),
  defaultSender: z
    .string()
    .default('')
    .description('Verified sender address included in prompt guidance, e.g. you@example.com.'),
  toolCallTimeoutMs: z
    .number()
    .default(60_000)
    .description('Per-tool-call timeout in milliseconds.'),
  startupTimeoutMs: z
    .number()
    .default(30_000)
    .description('Initial connection and tool-list timeout in milliseconds.'),
  failOnStartupError: z
    .boolean()
    .default(true)
    .description('Fail plugin activation instead of keeping resend_status with retries.'),
  maxInstructionBytes: z
    .number()
    .default(8_192)
    .description('Maximum UTF-8 bytes of optional server instructions added to the prompt.'),
})

/**
 * Render `resend_status` output as compact, secret-free text.
 *
 * @param {object} value - status value.
 * @returns {Array<{type: 'text', text: string}>} content blocks.
 */
function renderStatus(value) {
  const lines = [
    `Resend MCP: ${value.connected ? 'connected' : 'disconnected'}`,
    `Endpoint: ${value.endpoint}`,
    `Namespace: ${value.serverName}`,
    `Preset: ${value.preset}`,
    `Credential: ${value.credentialRef} (${value.credentialConfigured ? `configured via ${value.credentialSource || 'unknown'}` : 'not configured'})`,
    `Tools: ${value.registeredToolCount}/${value.availableToolCount} registered`,
  ]
  if (value.registeredTools.length > 0) lines.push(`Registered: ${value.registeredTools.join(', ')}`)
  if (value.missingPatterns.length > 0) lines.push(`Unmatched patterns: ${value.missingPatterns.join(', ')}`)
  if (value.missingExcludePatterns.length > 0) lines.push(`Unmatched excludes: ${value.missingExcludePatterns.join(', ')}`)
  if (value.lastError) lines.push(`Last error: ${value.lastError}`)
  return [{ type: 'text', text: lines.join('\n') }]
}

/**
 * Build the native diagnostic tool.
 *
 * @param {object} options - tool dependencies.
 * @param {object} options.ctx - plugin context carrying `credentials`.
 * @param {object} options.config - resolved plugin config.
 * @param {() => object} options.snapshot - current bridge state snapshot.
 * @returns {object} DSH tool definition.
 */
function createStatusTool({ ctx, config, snapshot }) {
  return defineTool({
    name: 'resend_status',
    description:
      'Report the Resend MCP plugin connection, credential reference (never the value), active tool preset, and registered tools.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        properties: {
          connected: { type: 'boolean' },
          serverName: { type: 'string' },
          endpoint: { type: 'string' },
          preset: { type: 'string' },
          credentialRef: { type: 'string' },
          credentialConfigured: { type: 'boolean' },
          credentialSource: { type: 'string' },
          registeredToolCount: { type: 'number' },
          registeredTools: { type: 'array', items: { type: 'string' } },
          availableToolCount: { type: 'number' },
          missingPatterns: { type: 'array', items: { type: 'string' } },
          missingExcludePatterns: { type: 'array', items: { type: 'string' } },
          lastError: { type: 'string' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => renderStatus(value),
    },
    async execute() {
      const ref = credentialRef(config.apiKeyEnv)
      let configured = false
      let source = ''
      try {
        const info = await ctx.credentials.describe(ref)
        configured = info?.configured === true
        source = typeof info?.source === 'string' ? info.source : ''
      } catch {
        /* status must not fail on a credential-store read error */
      }
      const state = snapshot()
      return {
        connected: state.connected,
        serverName: state.serverName,
        endpoint: state.endpoint,
        preset: state.preset,
        credentialRef: config.apiKeyEnv,
        credentialConfigured: configured,
        credentialSource: source,
        registeredToolCount: state.registeredTools.length,
        registeredTools: state.registeredTools,
        availableToolCount: state.availableCount,
        missingPatterns: state.missingPatterns,
        missingExcludePatterns: state.missingExcludePatterns,
        lastError: state.lastError,
      }
    },
  })
}

/**
 * Activate the plugin: resolve credentials lazily, connect, register tools,
 * publish a prompt section, and expose `resend_status`.
 *
 * @param {object} ctx - Cordis plugin context.
 * @param {object} config - validated plugin config.
 * @returns {Promise<void>} settles after the initial connection attempt.
 */
export async function apply(ctx, config) {
  const getApiKey = async () => {
    const ref = credentialRef(config.apiKeyEnv)
    const hit = await ctx.credentials.resolve(ref)
    if (hit === undefined || typeof hit.value !== 'string' || hit.value.trim().length === 0) {
      throw new Error(
        `Resend credential "${config.apiKeyEnv}" is not configured. ` +
          'Store the API key in DSH Settings > Credentials, or point "apiKeyEnv" at another credential reference.',
      )
    }
    return hit.value
  }

  const bridge = createBridge({
    config,
    getApiKey,
    makeToolDefinition: (options) => createMcpToolDefinition(ctx, options),
    registerTool: (definition) => ctx.tools.register(definition),
    logger: ctx.logger,
  })

  ctx.effect(
    () => {
      const dispose = ctx.tools.register(createStatusTool({ ctx, config, snapshot: bridge.snapshot }))
      return dispose
    },
    'dsh-resend-mcp.status',
  )

  ctx.effect(
    () => {
      const dispose = ctx.systemPrompt.section({
        name: 'tool:resend',
        order: 150,
        text: () => {
          const state = bridge.snapshot()
          return buildPromptText({
            serverName: config.serverName,
            preset: config.preset,
            selected: state.registeredTools,
            availableCount: state.availableCount,
            defaultSender: config.defaultSender,
            serverInstructions: state.serverInstructions,
            maxInstructionBytes: config.maxInstructionBytes,
          })
        },
      })
      return dispose
    },
    'dsh-resend-mcp.prompt',
  )

  ctx.effect(
    () => async () => {
      await bridge.close()
    },
    'dsh-resend-mcp.connection',
  )

  await bridge.start()
  ctx.logger.info(
    `dsh-resend-mcp: ready for ${config.url} with preset "${config.preset}" and ${bridge.snapshot().registeredTools.length} tool(s)`,
  )
}
