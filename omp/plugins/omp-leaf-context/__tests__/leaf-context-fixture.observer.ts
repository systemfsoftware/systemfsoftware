/**
 * Shared leaf-context integration fixture.
 *
 * The recording `ExtensionAPI` harness from the sibling
 * (`omp-agent-discipline`) stands in for the host — it captures `pi.on`
 * registrations and `pi.logger` calls, with no real OMP runtime in the test
 * process. The fixture tree and its `LeafFs` adapter live in
 * `@systemfsoftware/effect-memfs`, so the walk/read I/O exercised by the
 * tests goes through the same seam as production (only the driver differs).
 */
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect } from 'effect'
import type { LeafFs } from '../src/internal/leaf-fs.js'

export interface LoggedEvent {
  readonly level: 'info' | 'warn' | 'error' | 'debug'
  readonly message: unknown
  readonly context?: unknown
}

export interface RecordingHarness {
  readonly api: {
    on(event: string, handler: (event: unknown, ctx: unknown) => unknown): void
    logger: {
      info: (msg: unknown, ctx?: unknown) => void
      warn: (msg: unknown, ctx?: unknown) => void
      error: (msg: unknown, ctx?: unknown) => void
      debug: (msg: unknown, ctx?: unknown) => void
    }
  }
  fire(event: string, payload: Record<string, unknown>): unknown
  fireAsync(event: string, payload: Record<string, unknown>): Promise<unknown>
  recordedLogs: readonly LoggedEvent[]
}

export const SESSION_A = 'session-A'
export const SESSION_B = 'session-B'

export function buildSession(opts: {
  readonly sessionId: string
  readonly cwd?: string
} = { sessionId: SESSION_A }): RecordingHarness {
  const recordedLogs: LoggedEvent[] = []
  const handlers = new Map<string, ((event: unknown, ctx: unknown) => unknown)[]>()
  const sessionId = opts.sessionId
  const cwd = opts.cwd ?? '/project'
  const mockCtx = {
    cwd,
    sessionManager: { getSessionId: () => sessionId },
  } as unknown

  function fire(event: string, payload: Record<string, unknown>): unknown {
    const list = handlers.get(event) ?? []
    let result: unknown
    for (const handler of list) {
      result = handler(payload, mockCtx)
    }
    return result
  }

  async function fireAsync(event: string, payload: Record<string, unknown>): Promise<unknown> {
    const list = handlers.get(event) ?? []
    let result: unknown
    for (const handler of list) {
      result = await handler(payload, mockCtx)
    }
    return result
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

  return { api, fire, fireAsync, recordedLogs }
}

export const eventHas = (logs: readonly LoggedEvent[], event: string): boolean => logs.some((l) => l.message === event)

/** Memfs-backed LeafFs over a tree keyed by absolute paths rooted at '/'. */
export const memfsLeafFs = (contents: Record<string, string>): LeafFs => {
  const memfs = MemoryFileSystem.make(contents)
  return {
    exists: async (p) => Effect.runPromise(Effect.isSuccess(memfs.stat(p))),
    readFile: async (p) => Effect.runPromise(memfs.readFileString(p)),
  }
}
