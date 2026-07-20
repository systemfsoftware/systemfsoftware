/**
 * Tests for the xd:// retry guard extension.
 *
 * Same mock pattern as hook-dispatcher.test.ts: a minimal ExtensionAPI mock,
 * load the extension, fire events, assert on context-handler output.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MockExtensionAPI {
  readonly handlers: Map<string, Array<(event: never, ctx: never) => unknown>>
  on: (event: string, handler: (event: never, ctx: never) => unknown) => void
  readonly logger: {
    info: (message: unknown, context?: unknown) => void
    warn: (message: unknown, context?: unknown) => void
    error: (message: unknown, context?: unknown) => void
    debug: (message: unknown, context?: unknown) => void
  }
  readonly recordedLogs: Array<{ level: string; message: unknown; context?: unknown }>
}

interface AgentMessage {
  readonly role: string
  readonly content: unknown
}

interface ContextResult {
  readonly messages: readonly AgentMessage[]
}

async function loadGuard(): Promise<MockExtensionAPI> {
  const recordedLogs: MockExtensionAPI['recordedLogs'] = []
  const logger: MockExtensionAPI['logger'] = {
    info(message, context) {
      recordedLogs.push({ level: 'info', message, context })
    },
    warn(message, context) {
      recordedLogs.push({ level: 'warn', message, context })
    },
    error(message, context) {
      recordedLogs.push({ level: 'error', message, context })
    },
    debug(message, context) {
      recordedLogs.push({ level: 'debug', message, context })
    },
  }
  const api: MockExtensionAPI = {
    handlers: new Map(),
    on(event, handler) {
      const list = this.handlers.get(event) ?? []
      list.push(handler)
      this.handlers.set(event, list)
    },
    logger,
    recordedLogs,
  }
  // Dynamic import required: the guard's retry ledger is file-scope state;
  // resetModules gives each test a fresh ledger.
  const module = await import('../src/xd-retry-guard.ts')
  module.default(api as never)
  return api
}

beforeEach(() => {
  vi.resetModules()
})

const mockCtx = { cwd: '/tmp', sessionManager: { getSessionId: () => 'test-session' } } as never

function fire(
  api: MockExtensionAPI,
  event: string,
  payload: Record<string, unknown>,
): unknown {
  const handlers = api.handlers.get(event) ?? []
  let result: unknown
  for (const handler of handlers) {
    result = handler(payload as never, mockCtx)
  }
  return result
}

function messageText(message: AgentMessage | undefined): string {
  if (message === undefined) return ''
  const content: unknown = message.content
  if (!Array.isArray(content)) return ''
  const first: unknown = content[0]
  if (typeof first !== 'object' || first === null || !('text' in first) || typeof first.text !== 'string') return ''
  return first.text
}

function notFoundResult(tool: string): Record<string, unknown> {
  return {
    type: 'tool_execution_end',
    toolName: tool,
    toolCallId: 'tc-1',
    isError: true,
    result: { content: [{ type: 'text', text: `Tool ${tool} not found` }] },
  }
}

function fireContext(api: MockExtensionAPI): ContextResult | undefined {
  return fire(api, 'context', { type: 'context', messages: [] }) as ContextResult | undefined
}

describe('xd-retry-guard', () => {
  it('Should_InjectRetryReminder_When_ToolNotFoundFailureUnresolved', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', notFoundResult('retain'))
    const result = fireContext(api)
    expect(result).toBeDefined()
    const messages = result?.messages ?? []
    expect(messages.length).toBe(1)
    const text = messageText(messages[0])
    expect(text).toContain('xd://retain')
    expect(text).toContain('system-reminder')
  })

  it('Should_NotInjectReminder_When_NoFailureRecorded', async () => {
    const api = await loadGuard()
    const result = fireContext(api)
    expect(result).toBeUndefined()
  })

  it('Should_ClearLedgerEntry_When_WriteToXdDeviceStarts', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', notFoundResult('recall'))
    fire(api, 'tool_execution_start', {
      type: 'tool_execution_start',
      toolName: 'write',
      toolCallId: 'tc-2',
      args: { path: 'xd://recall', content: '{"query":"x"}' },
    })
    const result = fireContext(api)
    expect(result).toBeUndefined()
  })

  it('Should_KeepLedgerEntry_When_OnlyReadingXdDeviceDocs', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', notFoundResult('web_search'))
    fire(api, 'tool_execution_start', {
      type: 'tool_execution_start',
      toolName: 'read',
      toolCallId: 'tc-3',
      args: { path: 'xd://web_search' },
    })
    const result = fireContext(api)
    expect(result).toBeDefined()
    expect(messageText(result?.messages[0])).toContain('xd://web_search')
  })

  it('Should_IgnoreUnrelatedToolErrors_When_ResultDoesNotMatchPattern', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', {
      type: 'tool_execution_end',
      toolName: 'bash',
      toolCallId: 'tc-4',
      isError: true,
      result: { content: [{ type: 'text', text: 'command failed with exit code 1' }] },
    })
    const result = fireContext(api)
    expect(result).toBeUndefined()
  })

  // ── Telemetry ──

  it('Should_EmitGuardFired_When_FirstNotFoundFailure', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', notFoundResult('retain'))

    const firedRecords = api.recordedLogs.filter(
      (r) => r.level === 'info' && (r.context as Record<string, unknown>)?.event === 'guard.fired',
    )
    expect(firedRecords.length).toBe(1)
    const ctx = firedRecords[0]?.context as Record<string, unknown> | undefined
    expect(ctx?.plugin).toBe('agent_discipline')
    expect(ctx?.tool).toBe('retain')
    expect(ctx?.count).toBe(1)
  })

  it('Should_EmitGuardCleared_When_RetryExecutes', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', notFoundResult('retain'))
    fire(api, 'tool_execution_start', {
      type: 'tool_execution_start',
      toolName: 'write',
      toolCallId: 'tc-2',
      args: { path: 'xd://retain', content: '{"query":"x"}' },
    })

    const clearedRecords = api.recordedLogs.filter(
      (r) => r.level === 'info' && (r.context as Record<string, unknown>)?.event === 'guard.cleared',
    )
    expect(clearedRecords.length).toBe(1)
    const ctx = clearedRecords[0]?.context as Record<string, unknown> | undefined
    expect(ctx?.plugin).toBe('agent_discipline')
    expect(ctx?.tool).toBe('retain')
    expect(ctx?.count).toBe(0)
  })

  it('Should_EmitGuardReminded_When_LedgerNonEmptyOnContext', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', notFoundResult('recall'))
    const result = fireContext(api)
    expect(result).toBeDefined()

    const remindedRecords = api.recordedLogs.filter(
      (r) => r.level === 'info' && (r.context as Record<string, unknown>)?.event === 'guard.reminded',
    )
    expect(remindedRecords.length).toBe(1)
    const ctx = remindedRecords[0]?.context as Record<string, unknown> | undefined
    expect(ctx?.plugin).toBe('agent_discipline')
    expect(ctx?.count).toBe(1)
  })

  it('Should_NotThrow_When_LoggerThrows', async () => {
    const recordedLogs: MockExtensionAPI['recordedLogs'] = []
    const throwingLogger = {
      info() {
        throw new Error('logger failure')
      },
      warn() {},
      error() {},
      debug() {},
    }
    const api: MockExtensionAPI = {
      handlers: new Map(),
      on(event, handler) {
        const list = this.handlers.get(event) ?? []
        list.push(handler)
        this.handlers.set(event, list)
      },
      logger: throwingLogger,
      recordedLogs,
    }
    const module = await import('../src/xd-retry-guard.ts')
    module.default(api as never)

    // A throwing logger must not affect guard behavior.
    fire(api, 'tool_execution_end', notFoundResult('retain'))
    fire(api, 'tool_execution_start', {
      type: 'tool_execution_start',
      toolName: 'write',
      toolCallId: 'tc-5',
      args: { path: 'xd://retain', content: '{"query":"x"}' },
    })
    // If the guard worked despite logger throwing, no pending entries remain.
    const ctxResult = fireContext(api)
    expect(ctxResult).toBeUndefined()
  })

  // ── NOT_FOUND_RE case-insensitivity ──

  it('Should_DetectNotFound_When_ErrorTextIsLowerCase', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', {
      type: 'tool_execution_end',
      toolName: 'retain',
      toolCallId: 'tc-ci-1',
      isError: true,
      result: { content: [{ type: 'text', text: 'tool retain not found' }] },
    })
    const result = fireContext(api)
    expect(result).toBeDefined()
    expect(messageText(result?.messages[0])).toContain('xd://retain')
  })

  it('Should_DetectNotFound_When_ToolNameHasUnderscore', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', {
      type: 'tool_execution_end',
      toolName: 'ctx_execute',
      toolCallId: 'tc-ci-2',
      isError: true,
      result: { content: [{ type: 'text', text: 'Tool ctx_execute not found' }] },
    })
    const result = fireContext(api)
    expect(result).toBeDefined()
    expect(messageText(result?.messages[0])).toContain('xd://ctx_execute')
  })

  it('Should_DetectNotFound_When_ToolNameHasColonPrefix', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', {
      type: 'tool_execution_end',
      toolName: 'mcp__ctx_query',
      toolCallId: 'tc-ci-3',
      isError: true,
      result: { content: [{ type: 'text', text: 'Tool mcp__ctx_query not found' }] },
    })
    const result = fireContext(api)
    expect(result).toBeDefined()
    expect(messageText(result?.messages[0])).toContain('xd://mcp__ctx_query')
  })

  // ── Ledger FIFO eviction ──

  it('Should_EvictOldest_When_LedgerExceedsMaxSize', async () => {
    const api = await loadGuard()
    // Add LEDGER_MAX_SIZE (50) entries
    for (let i = 0; i < 50; i++) {
      fire(api, 'tool_execution_end', {
        type: 'tool_execution_end',
        toolName: `tool_${i}`,
        toolCallId: `tc-ev-${i}`,
        isError: true,
        result: { content: [{ type: 'text', text: `Tool tool_${i} not found` }] },
      })
    }
    // The 51st entry should evict tool_0
    fire(api, 'tool_execution_end', {
      type: 'tool_execution_end',
      toolName: 'tool_overflow',
      toolCallId: 'tc-ev-51',
      isError: true,
      result: { content: [{ type: 'text', text: 'Tool tool_overflow not found' }] },
    })

    // tool_0 should be evicted (no reminder for it)
    // tool_1 and tool_overflow should both be present
    const result = fireContext(api)
    expect(result).toBeDefined()
    const text = messageText(result?.messages[0])
    expect(text).not.toContain('xd://tool_0')
    expect(text).toContain('xd://tool_1')
    expect(text).toContain('xd://tool_overflow')
  })

  // ── Dedup context reminders ──

  it('Should_NotReRemind_When_ToolAlreadyRemindedWithoutNewFailure', async () => {
    const api = await loadGuard()
    // Record one failure
    fire(api, 'tool_execution_end', notFoundResult('retain'))
    // First context event: should remind
    const firstResult = fireContext(api)
    expect(firstResult).toBeDefined()
    expect(messageText(firstResult?.messages[0])).toContain('xd://retain')

    // Second context event without new failure: should NOT remind again
    const secondResult = fireContext(api)
    expect(secondResult).toBeUndefined()
  })

  it('Should_ReRemind_When_ToolFailsAgainAfterReminder', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', notFoundResult('retain'))
    // First context: consumes the reminder
    fireContext(api)

    // Second failure for the same tool triggers re-remind
    fire(api, 'tool_execution_end', notFoundResult('retain'))
    const result = fireContext(api)
    expect(result).toBeDefined()
    expect(messageText(result?.messages[0])).toContain('xd://retain')
  })

  it('Should_RemindOnlyNewTools_When_MixedWithAlreadyReminded', async () => {
    const api = await loadGuard()
    fire(api, 'tool_execution_end', notFoundResult('retain'))
    // First context: consumes retain's reminder
    fireContext(api)

    // New failure for a different tool
    fire(api, 'tool_execution_end', notFoundResult('web_search'))
    const result = fireContext(api)
    expect(result).toBeDefined()
    const text = messageText(result?.messages[0])
    // Should include the new tool but not the already-reminded one
    expect(text).toContain('xd://web_search')
    expect(text).not.toContain('xd://retain')
  })
})
