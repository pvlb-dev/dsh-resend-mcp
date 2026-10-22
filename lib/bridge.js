/**
 * Resend MCP connection supervisor.
 *
 * Owns one MCP client generation at a time, discovers tools, applies the
 * configured selection, registers native DSH tool definitions through the
 * callbacks supplied by the plugin entry, and reconnects with bounded
 * exponential backoff.
 *
 * This module deliberately knows nothing about Cordis or DSH service types:
 * the entry passes `getApiKey`, `makeToolDefinition`, and `registerTool`. That
 * keeps it testable and keeps credential handling in one place.
 *
 * @module dsh-resend-mcp/bridge
 */

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { publicToolName, resolveSelection } from './selection.js'

/** Default reconnect policy; bounded so a dead server cannot spin forever. */
const RECONNECT = Object.freeze({
  initialDelayMs: 500,
  maxDelayMs: 30_000,
  maxAttempts: 10,
})

/**
 * Normalize one thrown value into a short diagnostic line.
 *
 * @param {unknown} error - thrown value.
 * @returns {string} message safe for logs and `resend_status`.
 */
function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * Create the Resend MCP bridge.
 *
 * @param {object} options - bridge dependencies.
 * @param {object} options.config - resolved plugin config.
 * @param {string} options.config.serverName - tool namespace.
 * @param {string} options.config.url - MCP endpoint.
 * @param {string} options.config.preset - selection preset.
 * @param {string[]} options.config.tools - explicit allowlist.
 * @param {string[]} options.config.excludeTools - subtractive patterns.
 * @param {number} options.config.toolCallTimeoutMs - per-call timeout.
 * @param {number} options.config.startupTimeoutMs - initial connect budget.
 * @param {boolean} options.config.failOnStartupError - reject activation on first failure.
 * @param {() => Promise<string>} options.getApiKey - re-resolved on every attempt.
 * @param {(options: object) => object} options.makeToolDefinition - DSH adapter factory.
 * @param {(definition: object) => () => void} options.registerTool - registers one definition.
 * @param {{info: Function, warn: Function, error: Function}} [options.logger] - host logger.
 * @returns {{
 *   start: () => Promise<void>,
 *   resync: () => Promise<void>,
 *   close: () => Promise<void>,
 *   snapshot: () => object,
 * }} bridge handle.
 */
export function createBridge({ config, getApiKey, makeToolDefinition, registerTool, logger }) {
  const label = `dsh-resend-mcp(${config.serverName})`
  const state = {
    connected: false,
    serverName: config.serverName,
    endpoint: config.url,
    preset: config.preset,
    registeredTools: [],
    availableCount: 0,
    missingPatterns: [],
    missingExcludePatterns: [],
    serverInstructions: '',
    lastError: '',
    attempts: 0,
  }

  /** Currently connected client generation, if any. */
  let client
  /** Raw MCP tool definitions from the current sync, keyed by raw name. */
  let rawTools = new Map()
  /** Registered DSH definitions from the current generation, keyed by raw name. */
  let definitions = new Map()
  /** Disposers for the current registration generation. */
  let disposers = new Map()
  /** Serializes syncs so two swaps cannot interleave. */
  let syncChain = Promise.resolve()
  /** Pending reconnect timer. */
  let reconnectTimer
  /** Consecutive failed attempts in the current outage. */
  let failedAttempts = 0
  /** Time the current connection was established, for attempt-budget reset. */
  let connectedAt = 0
  /** Set when the plugin is unloading. */
  let disposed = false
  /** Set while the current generation is being closed intentionally. */
  let closingGeneration = false

  const log = {
    info: (text) => logger?.info?.(`${label}: ${text}`),
    warn: (text) => logger?.warn?.(`${label}: ${text}`),
    error: (text) => logger?.error?.(`${label}: ${text}`),
  }

  /**
   * Snapshot the non-secret bridge state for `resend_status`.
   *
   * @returns {object} a fresh copy.
   */
  function snapshot() {
    return {
      connected: state.connected,
      serverName: state.serverName,
      endpoint: state.endpoint,
      preset: state.preset,
      registeredTools: [...state.registeredTools],
      availableCount: state.availableCount,
      missingPatterns: [...state.missingPatterns],
      missingExcludePatterns: [...state.missingExcludePatterns],
      serverInstructions: state.serverInstructions,
      lastError: state.lastError,
      attempts: state.attempts,
    }
  }

  /** Dispose the current registration generation without throwing. */
  function disposeTools() {
    for (const dispose of disposers.values()) {
      try {
        dispose()
      } catch (error) {
        log.warn(`tool disposer failed: ${messageOf(error)}`)
      }
    }
    disposers = new Map()
    definitions = new Map()
    rawTools = new Map()
    state.registeredTools = []
  }

  /**
   * Register the current generation's selected tools.
   *
   * Builds every definition first, then disposes the previous generation and
   * registers the new one. If registration fails, the partial new generation
   * is disposed and the previous definitions are re-registered when possible.
   *
   * @param {Client} generation - connected client used by the callbacks.
   * @param {boolean} strict - propagate registration failures to the caller.
   */
  async function syncTools(generation, strict) {
    if (disposed || generation !== client) return
    const capabilities = generation.getServerCapabilities()
    const response =
      capabilities?.tools === undefined
        ? { tools: [] }
        : await generation.listTools(undefined, { cacheMode: 'refresh' })
    const listed = Array.isArray(response?.tools) ? response.tools : []
    const available = listed.map((tool) => tool.name)
    const selection = resolveSelection({
      preset: config.preset,
      tools: config.tools,
      excludeTools: config.excludeTools,
      available,
    })
    if (selection.selected.length === 0) {
      throw new Error(
        `no Resend tools match the configured selection (preset "${config.preset}", ` +
          `${available.length} tools available); check "tools"/"excludeTools" or choose another preset`,
      )
    }

    const byName = new Map(listed.map((tool) => [tool.name, tool]))
    const nextRaw = new Map()
    const nextDefinitions = new Map()
    for (const rawName of selection.selected) {
      const tool = byName.get(rawName)
      if (tool === undefined) continue
      nextRaw.set(tool.name, tool)
      nextDefinitions.set(
        tool.name,
        makeToolDefinition({
          name: publicToolName(config.serverName, tool.name),
          rawName: tool.name,
          description: tool.description ?? '',
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          taskRequired: tool.execution?.taskSupport === 'required',
          call: (args, execution) =>
            generation.callTool(
              { name: tool.name, arguments: args },
              {
                signal: execution.signal,
                timeout: config.toolCallTimeoutMs,
                toolDefinition: tool,
              },
            ),
        }),
      )
    }

    const previousDefinitions = definitions
    const previousDisposers = disposers
    for (const dispose of previousDisposers.values()) {
      try {
        dispose()
      } catch (error) {
        log.warn(`tool disposer failed: ${messageOf(error)}`)
      }
    }

    const nextDisposers = new Map()
    try {
      for (const [rawName, definition] of nextDefinitions) {
        nextDisposers.set(rawName, registerTool(definition))
      }
    } catch (error) {
      for (const dispose of nextDisposers.values()) {
        try {
          dispose()
        } catch {
          /* best effort rollback */
        }
      }
      const restored = new Map()
      for (const [rawName, definition] of previousDefinitions) {
        try {
          restored.set(rawName, registerTool(definition))
        } catch {
          /* previous generation cannot be restored; stay empty */
        }
      }
      if (restored.size > 0) {
        definitions = previousDefinitions
        rawTools = new Map([...rawTools].filter(([rawName]) => restored.has(rawName)))
        disposers = restored
        state.registeredTools = [...restored.keys()]
        log.warn(`tool registration failed; restored ${restored.size} previous tool(s): ${messageOf(error)}`)
      } else {
        definitions = new Map()
        rawTools = new Map()
        disposers = new Map()
        state.registeredTools = []
        log.error(`tool registration failed; no tools registered: ${messageOf(error)}`)
      }
      if (strict) throw error
      return
    }

    definitions = nextDefinitions
    rawTools = nextRaw
    disposers = nextDisposers
    state.connected = true
    state.registeredTools = [...nextDefinitions.keys()]
    state.availableCount = available.length
    state.missingPatterns = selection.missingPatterns
    state.missingExcludePatterns = selection.missingExcludePatterns
    state.lastError = ''
    log.info(
      `registered ${nextDefinitions.size}/${available.length} tools ` +
        `(preset "${config.preset}"${selection.missingPatterns.length > 0 ? `, unmatched: ${selection.missingPatterns.join(', ')}` : ''})`,
    )
  }

  /**
   * Serialize one sync behind the previous one.
   *
   * @param {Client} generation - generation to sync.
   * @param {boolean} strict - propagate failures.
   * @returns {Promise<void>} settles after the sync.
   */
  function enqueueSync(generation, strict) {
    const run = syncChain.then(() => syncTools(generation, strict))
    syncChain = run.catch(() => {})
    return run
  }

  /** Remove every registration after the reconnect budget is exhausted. */
  function unregisterAll() {
    disposeTools()
    state.connected = false
  }

  /**
   * Close one generation, swallowing transport errors.
   *
   * @param {Client | undefined} generation - client to close.
   */
  async function closeGeneration(generation) {
    if (generation === undefined) return
    closingGeneration = true
    try {
      await generation.close()
    } catch (error) {
      log.warn(`close failed: ${messageOf(error)}`)
    } finally {
      closingGeneration = false
    }
  }

  /** Schedule the next reconnect attempt, or give up after the budget. */
  function scheduleReconnect() {
    if (disposed) return
    if (connectedAt !== 0 && Date.now() - connectedAt >= RECONNECT.maxDelayMs) failedAttempts = 0
    connectedAt = 0
    failedAttempts += 1
    state.attempts = failedAttempts
    if (failedAttempts > RECONNECT.maxAttempts) {
      unregisterAll()
      state.lastError = `gave up after ${RECONNECT.maxAttempts} consecutive reconnect attempts`
      log.error(`${state.lastError}; reload the plugin or restart the Host`)
      return
    }
    const delayMs = Math.min(RECONNECT.maxDelayMs, RECONNECT.initialDelayMs * 2 ** (failedAttempts - 1))
    log.warn(`connection lost; reconnecting in ${delayMs}ms (attempt ${failedAttempts}/${RECONNECT.maxAttempts})`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      void attempt(false)
    }, delayMs)
    reconnectTimer.unref?.()
  }

  /** Handle an unexpected close of the live generation. */
  function generationDown() {
    if (disposed || closingGeneration) return
    client = undefined
    state.connected = false
    scheduleReconnect()
  }

  /**
   * One connection attempt: resolve the key, connect, then sync tools.
   *
   * @param {boolean} startup - true only for the activation attempt.
   * @returns {Promise<void>} rejects only when `strict` startup is configured.
   */
  async function attempt(startup) {
    if (disposed) return
    let apiKey
    try {
      apiKey = await getApiKey()
    } catch (error) {
      state.lastError = messageOf(error)
      if (startup && config.failOnStartupError) throw error
      log.error(state.lastError)
      scheduleReconnect()
      return
    }

    let generation
    let transport
    let timedOut = false
    try {
      generation = new Client(
        { name: 'dsh-resend-mcp', version: '0.1.0' },
        {
          capabilities: {},
          versionNegotiation: { mode: 'auto' },
          listChanged: {
            tools: {
              autoRefresh: false,
              debounceMs: 0,
              onChanged: () => {
                void enqueueSync(generation, false).catch((error) => {
                  if (!disposed) log.error(`tool re-sync failed: ${messageOf(error)}`)
                })
              },
            },
          },
        },
      )
      transport = new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
      })
      generation.onclose = () => {
        if (generation === client) generationDown()
      }
      generation.onerror = (error) => {
        if (!disposed) log.warn(`transport error: ${messageOf(error)}`)
      }

      const timer = setTimeout(() => {
        timedOut = true
        void closeGeneration(generation)
      }, config.startupTimeoutMs)
      timer.unref?.()
      try {
        await generation.connect(transport)
      } finally {
        clearTimeout(timer)
      }
      if (timedOut) throw new Error(`connection timed out after ${config.startupTimeoutMs}ms`)
      if (disposed) {
        await closeGeneration(generation)
        return
      }

      client = generation
      state.serverInstructions = generation.getInstructions() ?? ''
      state.connected = true
      state.lastError = ''
      await enqueueSync(generation, startup)
      connectedAt = Date.now()
      if (failedAttempts > 0) log.info(`reconnected after ${failedAttempts} failed attempt(s)`)
      failedAttempts = 0
      state.attempts = 0
    } catch (error) {
      state.connected = false
      state.lastError = messageOf(error)
      if (generation !== undefined) await closeGeneration(generation)
      if (client === generation) client = undefined
      if (startup && config.failOnStartupError) throw error
      log.warn(`connection attempt failed: ${state.lastError}`)
      scheduleReconnect()
    }
  }

  return {
    async start() {
      await attempt(true)
    },
    async resync() {
      if (disposed || client === undefined) return
      await enqueueSync(client, false)
    },
    async close() {
      disposed = true
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }
      disposeTools()
      const generation = client
      client = undefined
      state.connected = false
      if (generation !== undefined) await closeGeneration(generation)
    },
    snapshot,
  }
}
