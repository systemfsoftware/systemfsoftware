/**
 * Shared dispatch-doctrine integration fixture.
 *
 * Real filesystem helpers (mkdtemp + cleanup) and the recording `ExtensionAPI`
 * harness that captures `pi.on` registrations and `pi.logger` calls. There is
 * no real Claude Code runtime in the test process — the recording harness
 * stands in for the host because there is no other way to drive a `pi.on`
 * handler from a unit test; it is an interface boundary, not a substitute
 * for real I/O.
 *
 * Observer modules (the sanctioned home for test machinery) are imported by
 * multiple test files; they must not import shell cells themselves.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

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

export const DISPATCH_DUTY_TOML = `dispatch_doctrine_skills = ["task-decomposition"]`
export const BOTH_GUARDS_TOML = `dispatch_doctrine_skills = ["task-decomposition"]
no_delegate_skills = ["task-decomposition"]`

export function buildSession(opts: {
  readonly sessionId: string
  readonly cwd?: string
} = { sessionId: SESSION_A }): RecordingHarness {
  const recordedLogs: LoggedEvent[] = []
  const handlers = new Map<string, ((event: unknown, ctx: unknown) => unknown)[]>()
  const sessionId = opts.sessionId
  const cwd = opts.cwd ?? '/test'
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

export const createProjectDir = (files: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-dispatch-'))
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body)
  }
  return dir
}

export const resetProjectDir = (dir: string): void => {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
}
