/**
 * Handler cell — transport terminus for the dispatch-doctrine gate.
 *
 * Registers three `pi.on` handlers:
 *   - `tool_call` on `task`/`agent`: the gate. Not-loaded + gate-on →
 *     block with the kernel constant; either side allows + emits
 *     `agent_discipline.dispatch.observed` with the spec-shape telemetry.
 *   - `tool_execution_start` on `read`: record a pending shape-test
 *     when the read path targets a doctrine skill.
 *   - `tool_execution_end` on `read`: flip the session flag only when
 *     the matching pending read completed without error, then emit
 *     `agent_discipline.doctrine.loaded`.
 *
 * Flag storage is a module-level `Map` keyed by session id (R8). The map
 * is capped at 50 entries; eviction never drops the entry for the
 * session id currently dispatching (KTD5). The pending-reads map is
 * keyed by `toolCallId` and is best-effort garbage collected when the
 * matching end never arrives.
 *
 * The handler delegates exclusively to `dispatch-doctrine.executor.js`
 * (its single permitted dependency surface): the gate decision goes
 * through one `Effect.either(runDispatchDoctrineCheck(...))` call, and the
 * pure matchers for read-tracking and telemetry arrive via the executor's
 * `dispatchDoctrinePure` re-export. The shell edge runs effects through
 * the lazily-imported `run-safe.policy.js` so the platform-node runtime
 * never evaluates at plugin-registration time (EXT1).
 *
 * The failure posture is "fail-closed throw → caught-and-allow": a
 * thrown handler body used to block dispatch via the runner's 30s
 * timeout. The plugin's `runSafe` already converts errors to allow
 * with a structured log; we mirror that here — a handler exception
 * never blocks a dispatch, but every run-safe call emits a telemetry
 * warning so the failure is observable.
 */

import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent'
import { Effect, Either } from 'effect'
import { dispatchDoctrinePure, runDispatchDoctrineCheck } from './dispatch-doctrine.executor.js'
import type { RunSafe } from './run-safe.kernel.js'

const FLAG_MAP_MAX = 50
const PENDING_READS_MAX = 200

const flagStore = new Map<string, boolean>()
const pendingReads = new Map<string, string>()
const skillsCache = new Map<string, readonly string[]>()
const warmPending = new Map<string, Promise<void>>()

const readSessionId = (ctx: ExtensionContext): string => {
  const id = ctx.sessionManager.getSessionId()
  return typeof id === 'string' ? id : ''
}

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === 'object' && input !== null && !Array.isArray(input)

const decodeRecord = (input: unknown): Record<string, unknown> => (isRecord(input) ? input : {})

const readString = (input: Record<string, unknown>, ...keys: readonly string[]): string => {
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

const flipLoaded = (sessionId: string, activeDispatchSessionId: string): void => {
  if (sessionId === '') return
  if (flagStore.has(sessionId)) {
    flagStore.set(sessionId, true)
    return
  }
  if (flagStore.size < FLAG_MAP_MAX) {
    flagStore.set(sessionId, true)
    return
  }
  for (const key of flagStore.keys()) {
    if (key === activeDispatchSessionId) continue
    flagStore.delete(key)
    flagStore.set(sessionId, true)
    return
  }
  flagStore.set(sessionId, true)
}

const rememberPendingRead = (toolCallId: string, path: string): void => {
  if (pendingReads.size >= PENDING_READS_MAX) {
    const firstKey = pendingReads.keys().next().value
    if (typeof firstKey === 'string') pendingReads.delete(firstKey)
  }
  pendingReads.set(toolCallId, path)
}

const warmSkills = (runSafe: RunSafe, cwd: string): Promise<void> => {
  const pending = runSafe(runDispatchDoctrineCheck(cwd, 'read', false))
    .then(({ skills }) => {
      skillsCache.set(cwd, skills)
    })
    .catch(() => {
      skillsCache.set(cwd, [])
    })
    .finally(() => {
      if (warmPending.get(cwd) === pending) warmPending.delete(cwd)
    })
  warmPending.set(cwd, pending)
  return pending
}

const safeLog = (
  logger: ExtensionAPI['logger'] | undefined,
  message: string,
  context: Record<string, unknown>,
): void => {
  if (logger === undefined) return
  try {
    const fn = logger.info
    if (typeof fn === 'function') {
      fn.call(logger, message, context)
    }
  } catch {
    // Telemetry must never throw — see runSafe contract.
  }
}

const batchSize = (payload: readonly unknown[] | null): number => {
  if (payload === null) return 1
  return payload.length
}

const dispatchSpecText = (input: Record<string, unknown>): string => {
  const direct = readString(input, 'task', 'description', 'prompt')
  const tasksRaw = input['tasks']
  if (!Array.isArray(tasksRaw)) return direct
  const inline = tasksRaw
    .map((item) => typeof item === 'string' ? item : readString(decodeRecord(item), 'task', 'description', 'prompt'))
    .filter((text) => text.length > 0)
    .join('\n')
  if (direct.length === 0) return inline
  return direct + '\n' + inline
}

const tasksArrayOf = (input: Record<string, unknown>): readonly unknown[] | null => {
  const tasksRaw = input['tasks']
  return Array.isArray(tasksRaw) ? tasksRaw : null
}

export const DispatchDoctrineExtension = (pi: ExtensionAPI, runSafe: RunSafe): void => {
  pi.on('tool_call', async (event, ctx) => {
    const sessionId = readSessionId(ctx)
    const input = decodeRecord(event.input)
    const doctrineLoaded = sessionId === '' ? false : (flagStore.get(sessionId) ?? false)

    const check = await runSafe(
      Effect.either(runDispatchDoctrineCheck(ctx.cwd, event.toolName, doctrineLoaded)),
    )
    if (Either.isLeft(check)) throw check.left
    const { skills, gate } = check.right
    skillsCache.set(ctx.cwd, skills)

    const size = batchSize(tasksArrayOf(input))
    const shape = dispatchDoctrinePure.extractSpecShape(dispatchSpecText(input))

    if (gate !== undefined) {
      flipLoaded(sessionId, sessionId)
      safeLog(pi.logger, 'agent_discipline.dispatch.blocked', {
        plugin: 'agent_discipline',
        session_id: sessionId,
        tool: event.toolName,
        reason: 'kernel_delivered',
        batch_size: size,
        has_objective: shape.hasObjective,
        has_write_scope: shape.hasWriteScope,
        has_verify_commands: shape.hasVerifyCommands,
      })
      return { block: true as const, reason: gate.reason }
    }

    safeLog(pi.logger, 'agent_discipline.dispatch.observed', {
      plugin: 'agent_discipline',
      session_id: sessionId,
      tool: event.toolName,
      batch_size: size,
      has_objective: shape.hasObjective,
      has_write_scope: shape.hasWriteScope,
      has_verify_commands: shape.hasVerifyCommands,
    })
    return undefined
  })

  pi.on('tool_execution_start', (event, ctx) => {
    if (event.toolName !== 'read') return
    const toolCallId = event.toolCallId
    if (typeof toolCallId !== 'string' || toolCallId.length === 0) return
    const args = decodeRecord(event.args)
    const path = args['path']
    if (typeof path !== 'string') return
    rememberPendingRead(toolCallId, path)
    if (!skillsCache.has(ctx.cwd)) void warmSkills(runSafe, ctx.cwd)
  })

  pi.on('tool_execution_end', async (event, ctx) => {
    if (event.toolName !== 'read') return
    const toolCallId = event.toolCallId
    if (typeof toolCallId !== 'string' || toolCallId.length === 0) return
    const path = pendingReads.get(toolCallId)
    pendingReads.delete(toolCallId)
    if (path === undefined) return
    if (event.isError) return

    const inFlight = warmPending.get(ctx.cwd)
    if (inFlight !== undefined) await inFlight
    const skills = skillsCache.get(ctx.cwd)
    if (skills === undefined) return
    if (!dispatchDoctrinePure.matchesDoctrineSkillPath(path, skills)) return

    const sessionId = readSessionId(ctx)
    if (sessionId === '') return
    flipLoaded(sessionId, sessionId)
    safeLog(pi.logger, 'agent_discipline.doctrine.loaded', {
      plugin: 'agent_discipline',
      session_id: sessionId,
      tool: event.toolName,
    })
  })

  pi.on('session_start', (_event, ctx) => {
    void warmSkills(runSafe, ctx.cwd)
  })
}
