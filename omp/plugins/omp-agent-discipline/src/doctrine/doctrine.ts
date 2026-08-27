import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, pipe, Result } from 'effect'
import { decodeRecord, readString } from '../record.js'
import { DispatchDoctrineSkills } from './config.js'
import {
  CheckDispatchCommand,
  checkDispatchDoctrine,
  type DispatchDoctrineImpossible,
  type DispatchDoctrineVerdict,
  DOCTRINE_KERNEL,
  extractSpecShape,
  matchesDoctrineSkillPath,
} from './doctrine.workflow.js'

export { DOCTRINE_KERNEL }

export type DispatchGateResult = { readonly block: true; readonly reason: string } | undefined

export type DisciplineContext = DispatchDoctrineSkills

export type RunSafe<R> = <A, E>(effect: Effect.Effect<A, E, R>) => Promise<A>

const gateResult = (verdict: DispatchDoctrineVerdict): DispatchGateResult =>
  Match.value(verdict).pipe(
    Match.tag('DeliverDoctrine', (v) => ({ block: true as const, reason: v.reason })),
    Match.tag('Allow', () => undefined),
    Match.exhaustive,
  )

const readDoctrineSkills = (cwd: string): Effect.Effect<readonly string[], never, DispatchDoctrineSkills> =>
  Effect.gen(function*() {
    const svc = yield* DispatchDoctrineSkills
    return svc.get(cwd)
  })

export type DispatchDoctrineCheck = {
  readonly skills: readonly string[]
  readonly gate: DispatchGateResult
}

interface DoctrinePhases extends Cell.Phases {
  readonly command: { readonly cwd: string; readonly toolName: string; readonly doctrineLoaded: boolean }
  readonly raw: readonly string[]
  readonly decoded: CheckDispatchCommand
  readonly decision: DispatchDoctrineVerdict
  readonly decisionError: DispatchDoctrineImpossible
  readonly output: DispatchDoctrineCheck
  readonly response: DispatchDoctrineCheck
  readonly decodeError: never
  readonly readError: never
  readonly writeError: never
}

export function runDispatchDoctrineCheck(
  cwd: string,
  toolName: string,
  doctrineLoaded: boolean,
): Effect.Effect<DispatchDoctrineCheck, never, DispatchDoctrineSkills> {
  let skills: readonly string[] = []
  return Effect.flatMap(
    Effect.context<DispatchDoctrineSkills>(),
    (services) =>
      Cell.apply(
        pipe(
          Cell.read<DoctrinePhases>(({ cwd: dir }) =>
            Effect.provideContext(readDoctrineSkills(dir), services).pipe(Effect.tap((loaded) =>
              Effect.sync(() => {
                skills = loaded
              })
            ))
          ),
          Cell.decode<DoctrinePhases>((loaded) =>
            Result.succeed(
              CheckDispatchCommand.make({
                toolName,
                doctrineLoaded,
                gateEnabled: loaded.length > 0,
              }),
            )
          ),
          Cell.decide<DoctrinePhases>(checkDispatchDoctrine),
          Cell.encode<DoctrinePhases>((outcome) => ({
            skills,
            gate: Result.match(outcome, {
              onFailure: () => undefined,
              onSuccess: gateResult,
            }),
          })),
          Cell.write<DoctrinePhases>((check) => Effect.succeed(check)),
        ),
        { cwd, toolName, doctrineLoaded },
      ),
  )
}

const FLAG_MAP_MAX = 50
const PENDING_READS_MAX = 200

const flagStore = new Map<string, boolean>()
const pendingReads = new Map<string, string>()
const skillsCache = new Map<string, readonly string[]>()
const warmPending = new Map<string, Promise<void>>()

export const __resetDoctrineStateForTesting = (): void => {
  flagStore.clear()
  pendingReads.clear()
  skillsCache.clear()
  warmPending.clear()
}

const readSessionId = (ctx: ExtensionContext): string => {
  const id = ctx.sessionManager.getSessionId()
  return typeof id === 'string' ? id : ''
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
const warmSkills = (runSafe: RunSafe<DisciplineContext>, cwd: string): Promise<void> => {
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
    // Telemetry must never throw
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
    .map((item) => (typeof item === 'string' ? item : readString(decodeRecord(item), 'task', 'description', 'prompt')))
    .filter((text) => text.length > 0)
    .join('\n')
  if (direct.length === 0) return inline
  return direct + '\n' + inline
}

const tasksArrayOf = (input: Record<string, unknown>): readonly unknown[] | null => {
  const tasksRaw = input['tasks']
  return Array.isArray(tasksRaw) ? tasksRaw : null
}

export const DispatchDoctrineExtension = (pi: ExtensionAPI, runSafe: RunSafe<DisciplineContext>): void => {
  pi.on('tool_call', async (event, ctx) => {
    const sessionId = readSessionId(ctx)
    const input = decodeRecord(event.input)
    const doctrineLoaded = sessionId === '' ? false : (flagStore.get(sessionId) ?? false)

    const check = await runSafe(
      Effect.result(runDispatchDoctrineCheck(ctx.cwd, event.toolName, doctrineLoaded)),
    )
    if (Result.isFailure(check)) throw check.failure
    const { skills, gate } = check.success
    skillsCache.set(ctx.cwd, skills)

    const size = batchSize(tasksArrayOf(input))
    const shape = extractSpecShape(dispatchSpecText(input))

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
    if (!matchesDoctrineSkillPath(path, skills)) return

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
