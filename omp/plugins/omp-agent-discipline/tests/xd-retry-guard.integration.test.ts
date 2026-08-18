import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect, vi } from 'vitest'

import * as XdRetryGuard from '../src/XdRetryGuardMiddleware.js'

const Feature = makeFeature({ it, layer })

// ── Shared helpers ──

interface AgentMessage {
  readonly content: readonly unknown[]
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

function createMockGuard() {
  const recordedLogs: { level: string; message: unknown; context?: unknown }[] = []
  const handlers = new Map<string, ((event: unknown, ctx: unknown) => unknown)[]>()
  const mockCtx = { cwd: '/tmp', sessionManager: { getSessionId: () => 'test-session' } } as unknown

  function fire(event: string, payload: Record<string, unknown>): unknown {
    const list = handlers.get(event) ?? []
    let result: unknown
    for (const handler of list) {
      result = handler(payload, mockCtx)
    }
    return result
  }

  function fireContext(): { messages: readonly AgentMessage[] } | undefined {
    return fire('context', { type: 'context', messages: [] }) as { messages: readonly AgentMessage[] } | undefined
  }

  const api = {
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown) {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
    },
    logger: {
      info(message: unknown, context?: unknown) {
        recordedLogs.push({ level: 'info', message, context })
      },
      warn(message: unknown, context?: unknown) {
        recordedLogs.push({ level: 'warn', message, context })
      },
      error(message: unknown, context?: unknown) {
        recordedLogs.push({ level: 'error', message, context })
      },
      debug(message: unknown, context?: unknown) {
        recordedLogs.push({ level: 'debug', message, context })
      },
    },
  }

  return { api, fire, fireContext, recordedLogs, handlers }
}

Feature('xd:// retry guard').body(({ scenario }) => {
  scenario(
    'Should inject retry reminder when tool not found failure unresolved',
    Gherkin.Do.pipe(
      Given('the retry guard is loaded')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          return g
        })),
      When('a tool returns not found and context is requested')('ctx', (s) =>
        Effect.sync(() => {
          s.guard.fire('tool_execution_end', notFoundResult('retain'))
          const result = s.guard.fireContext()
          return result
        })),
      Then('the context handler should include a retry reminder for xd://retain')((s) =>
        Effect.sync(() => {
          expect(s.ctx).toBeDefined()
          const text = messageText(s.ctx?.messages[0])
          expect(text).toContain('xd://retain')
          expect(text).toContain('⚠️ Unresolved Tool Calls')
        })
      ),
    ),
  )

  scenario(
    'Should not inject reminder when no failure recorded',
    Gherkin.Do.pipe(
      Given('the retry guard is loaded with no recorded errors')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          return g
        })),
      When('context is requested without any preceding failure')(
        'ctx',
        (s) => Effect.sync(() => s.guard.fireContext()),
      ),
      Then('the context handler should return undefined')((s) =>
        Effect.sync(() => {
          expect(s.ctx).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'Should clear ledger entry when xd:// write starts',
    Gherkin.Do.pipe(
      Given('a guard with a recorded recall failure')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          g.fire('tool_execution_end', notFoundResult('recall'))
          return g
        })),
      When('a write to xd://recall starts')('ctx', (s) =>
        Effect.sync(() => {
          s.guard.fire('tool_execution_start', {
            type: 'tool_execution_start',
            toolName: 'write',
            toolCallId: 'tc-2',
            args: { path: 'xd://recall', content: '{"query":"x"}' },
          })
          return s.guard.fireContext()
        })),
      Then('the reminder should be cleared')((s) =>
        Effect.sync(() => {
          expect(s.ctx).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'Should keep ledger entry when only reading xd:// docs',
    Gherkin.Do.pipe(
      Given('a guard with a web_search failure recorded')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          g.fire('tool_execution_end', notFoundResult('web_search'))
          return g
        })),
      When('a read of xd://web_search starts')('ctx', (s) =>
        Effect.sync(() => {
          s.guard.fire('tool_execution_start', {
            type: 'tool_execution_start',
            toolName: 'read',
            toolCallId: 'tc-3',
            args: { path: 'xd://web_search' },
          })
          return s.guard.fireContext()
        })),
      Then('the reminder should persist')((s) =>
        Effect.sync(() => {
          expect(s.ctx).toBeDefined()
          expect(messageText(s.ctx?.messages[0])).toContain('xd://web_search')
        })
      ),
    ),
  )

  scenario(
    'Should ignore unrelated tool errors',
    Gherkin.Do.pipe(
      Given('a guard loaded')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          return g
        })),
      When('an unrelated bash error fires')('ctx', (s) =>
        Effect.sync(() => {
          s.guard.fire('tool_execution_end', {
            type: 'tool_execution_end',
            toolName: 'bash',
            toolCallId: 'tc-4',
            isError: true,
            result: { content: [{ type: 'text', text: 'command failed with exit code 1' }] },
          })
          return s.guard.fireContext()
        })),
      Then('the context handler should return undefined')((s) =>
        Effect.sync(() => {
          expect(s.ctx).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'Should detect not found when error text is lower case',
    Gherkin.Do.pipe(
      Given('a guard loaded')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          return g
        })),
      When('a lower-case not found error fires')('ctx', (s) =>
        Effect.sync(() => {
          s.guard.fire('tool_execution_end', {
            type: 'tool_execution_end',
            toolName: 'retain',
            toolCallId: 'tc-ci-1',
            isError: true,
            result: { content: [{ type: 'text', text: 'tool retain not found' }] },
          })
          return s.guard.fireContext()
        })),
      Then('the guard should still detect it')((s) =>
        Effect.sync(() => {
          expect(s.ctx).toBeDefined()
          expect(messageText(s.ctx?.messages[0])).toContain('xd://retain')
        })
      ),
    ),
  )

  scenario(
    'Should detect not found when tool name has underscore',
    Gherkin.Do.pipe(
      Given('a guard loaded')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          return g
        })),
      When('a not found error fires for ctx_execute')('ctx', (s) =>
        Effect.sync(() => {
          s.guard.fire('tool_execution_end', {
            type: 'tool_execution_end',
            toolName: 'ctx_execute',
            toolCallId: 'tc-ci-2',
            isError: true,
            result: { content: [{ type: 'text', text: 'Tool ctx_execute not found' }] },
          })
          return s.guard.fireContext()
        })),
      Then('the guard should prefix with xd://')((s) =>
        Effect.sync(() => {
          expect(s.ctx).toBeDefined()
          expect(messageText(s.ctx?.messages[0])).toContain('xd://ctx_execute')
        })
      ),
    ),
  )

  scenario(
    'Should detect not found when tool name has colon prefix',
    Gherkin.Do.pipe(
      Given('a guard loaded')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          return g
        })),
      When('a not found error fires for mcp__ctx_query')('ctx', (s) =>
        Effect.sync(() => {
          s.guard.fire('tool_execution_end', {
            type: 'tool_execution_end',
            toolName: 'mcp__ctx_query',
            toolCallId: 'tc-ci-3',
            isError: true,
            result: { content: [{ type: 'text', text: 'Tool mcp__ctx_query not found' }] },
          })
          return s.guard.fireContext()
        })),
      Then('the guard should prefix with xd://')((s) =>
        Effect.sync(() => {
          expect(s.ctx).toBeDefined()
          expect(messageText(s.ctx?.messages[0])).toContain('xd://mcp__ctx_query')
        })
      ),
    ),
  )

  scenario(
    'Should evict oldest entry when ledger exceeds max size',
    Gherkin.Do.pipe(
      Given('a guard loaded')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          for (let i = 0; i < 50; i++) {
            g.fire('tool_execution_end', {
              type: 'tool_execution_end',
              toolName: `tool_${i}`,
              toolCallId: `tc-ev-${i}`,
              isError: true,
              result: { content: [{ type: 'text', text: `Tool tool_${i} not found` }] },
            })
          }
          return g
        })),
      When('the 51st entry overflows the ledger')('ctx', (s) =>
        Effect.sync(() => {
          s.guard.fire('tool_execution_end', {
            type: 'tool_execution_end',
            toolName: 'tool_overflow',
            toolCallId: 'tc-ev-51',
            isError: true,
            result: { content: [{ type: 'text', text: 'Tool tool_overflow not found' }] },
          })
          return s.guard.fireContext()
        })),
      Then('the oldest entry should be evicted and newer ones kept')((s) =>
        Effect.sync(() => {
          expect(s.ctx).toBeDefined()
          const text = messageText(s.ctx?.messages[0])
          expect(text).not.toContain('xd://tool_0')
          expect(text).toContain('xd://tool_1')
          expect(text).toContain('xd://tool_overflow')
        })
      ),
    ),
  )

  scenario(
    'Should not re-remind when tool already reminded without new failure',
    Gherkin.Do.pipe(
      Given('a guard with a retain failure already consumed by context')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          g.fire('tool_execution_end', notFoundResult('retain'))
          g.fireContext()
          return g
        })),
      When('context is requested again without new failures')(
        'second',
        (s) => Effect.sync(() => s.guard.fireContext()),
      ),
      Then('the guard should not re-remind')((s) =>
        Effect.sync(() => {
          expect(s.second).toBeUndefined()
        })
      ),
    ),
  )

  scenario(
    'Should re-remind when tool fails again after previous reminder',
    Gherkin.Do.pipe(
      Given('a guard where retain failed and was reminded')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          g.fire('tool_execution_end', notFoundResult('retain'))
          g.fireContext()
          return g
        })),
      When('retain fails again and context is requested')('result', (s) =>
        Effect.sync(() => {
          s.guard.fire('tool_execution_end', notFoundResult('retain'))
          return s.guard.fireContext()
        })),
      Then('the guard should inject a new reminder')((s) =>
        Effect.sync(() => {
          expect(s.result).toBeDefined()
          expect(messageText(s.result?.messages[0])).toContain('xd://retain')
        })
      ),
    ),
  )

  scenario(
    'Should remind only for new tools when mixed with already reminded',
    Gherkin.Do.pipe(
      Given('a guard with retain consumed and web_search failing')('guard', () =>
        Effect.promise(async () => {
          vi.resetModules()
          const g = createMockGuard()
          await import('../src/XdRetryGuardMiddleware.js')

          XdRetryGuard.XdRetryGuardExtension(g.api as never)
          g.fire('tool_execution_end', notFoundResult('retain'))
          g.fireContext()
          g.fire('tool_execution_end', notFoundResult('web_search'))
          return g
        })),
      When('context is requested')('result', (s) => Effect.sync(() => s.guard.fireContext())),
      Then('the reminder should include web_search but not retain')((s) =>
        Effect.sync(() => {
          expect(s.result).toBeDefined()
          const text = messageText(s.result?.messages[0])
          expect(text).toContain('xd://web_search')
          expect(text).not.toContain('xd://retain')
        })
      ),
    ),
  )
})
