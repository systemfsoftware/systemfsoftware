import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent'
import { Cell } from '@systemfsoftware/effect-cell-types'
import { Effect, Match, Result } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import { decodeRecord, readString } from '../record.js'
import { DispatchDoctrineSkills } from './config.js'
import { CheckDispatchCommand, checkDispatchDoctrine, type DispatchDoctrineVerdict } from './doctrine.workflow.js'
export const DOCTRINE_KERNEL =
  `Refuse monolithic dispatches: size the unit, specify it completely, then dispatch — or do the work inline.

rules:
- GATE: decomposition is mandatory when ANY hold — multi-subsystem; exceeds one focused session for the worker's model class; irreversible side effects; verification longer than the work; incompatible reasoning modes. Dispatching monolithically anyway is an invalid dispatch: split, or do it yourself.
- SPEC: every dispatched unit carries objective, write_scope, verify_commands, acceptance, size_estimate, context_paths, rollback, dependencies — written before work starts. Missing any field is undispatchable.
- CHECK: verifier is not the maker. Run each unit's verify commands fresh in your own context; never accept a worker's reported output or completeness claims. A verify failure rejects the unit: record the failure, re-dispatch with the evidence.
- FENCE: parallel units need disjoint write scopes, confirmed by comparing write_scope declarations literally — never inferred from topic. Overlap forces serialization.

Full doctrine: skill://task-decomposition — sizing calibration, the dispatch contract, rejection rules, repair-retry. Refuse monolithic dispatches: size, specify, then dispatch or refuse.`

const SKILL_SCHEME = 'skill://'
const SKILLS_DIR = '/skills/'
const SKILL_FILE = '/SKILL.md'

const skillUriName = (path: string): string | null => {
  const body = path.slice(SKILL_SCHEME.length)
  if (body.length === 0) return null
  const nameEnd = body.search(/[:/]/)
  return nameEnd === -1 ? body : body.slice(0, nameEnd)
}

const normalizeFilesystemPath = (path: string): string => path.split('\\').join('/')

const matchesSkillTail = (normalizedPath: string, skill: string): boolean => {
  const tail = SKILLS_DIR + skill + SKILL_FILE
  return normalizedPath.endsWith(tail)
}

export const matchesDoctrineSkillPath = (
  path: string,
  skills: readonly string[],
): boolean => {
  if (path.startsWith(SKILL_SCHEME)) {
    const name = skillUriName(path)
    if (name === null) return false
    return skills.includes(name)
  }

  const normalized = normalizeFilesystemPath(path)
  for (const skill of skills) {
    if (matchesSkillTail(normalized, skill)) return true
  }
  return false
}

const SPEC_FIELD_PATTERNS = {
  hasObjective: /\bobjective\b/i,
  hasWriteScope: /\bwrite_scope\b/i,
  hasVerifyCommands: /\bverify_commands\b/i,
} as const

export const extractSpecShape = (text: string): {
  readonly hasObjective: boolean
  readonly hasWriteScope: boolean
  readonly hasVerifyCommands: boolean
} => ({
  hasObjective: SPEC_FIELD_PATTERNS.hasObjective.test(text),
  hasWriteScope: SPEC_FIELD_PATTERNS.hasWriteScope.test(text),
  hasVerifyCommands: SPEC_FIELD_PATTERNS.hasVerifyCommands.test(text),
})

export type DispatchGateResult = { readonly block: true; readonly reason: string } | undefined

export type DisciplineContext = DispatchDoctrineSkills | FileSystem.FileSystem

export type RunSafe<R> = <A, E>(effect: Effect.Effect<A, E, R>) => Promise<A>

const gateResult = (verdict: DispatchDoctrineVerdict): DispatchGateResult =>
  Match.value(verdict).pipe(
    Match.tag('DeliverDoctrine', () => ({ block: true as const, reason: DOCTRINE_KERNEL })),
    Match.tag('Allow', () => undefined),
    Match.exhaustive,
  )

const readDoctrineSkills = (
  cwd: string,
): Effect.Effect<readonly string[], never, DispatchDoctrineSkills | FileSystem.FileSystem> =>
  Effect.gen(function*() {
    const svc = yield* DispatchDoctrineSkills
    return yield* svc.load(cwd)
  })

export type DispatchDoctrineCheck = {
  readonly skills: readonly string[]
  readonly gate: DispatchGateResult
}

const doctrineCell = (toolName: string, doctrineLoaded: boolean) =>
  Cell.layer({
    read: ({ cwd }: { readonly cwd: string; readonly toolName: string; readonly doctrineLoaded: boolean }) =>
      readDoctrineSkills(cwd),
    decode: (loaded) =>
      Result.succeed(
        CheckDispatchCommand.make({
          toolName,
          doctrineLoaded,
          gateEnabled: loaded.length > 0,
        }),
      ),
    decide: checkDispatchDoctrine,
    encode: (outcome) =>
      Result.match(outcome, {
        onFailure: () => undefined,
        onSuccess: gateResult,
      }),
    write: (gate, raw) => Effect.succeed({ skills: raw, gate }),
  })

export function runDispatchDoctrineCheck(
  cwd: string,
  toolName: string,
  doctrineLoaded: boolean,
): Effect.Effect<DispatchDoctrineCheck, never, DispatchDoctrineSkills | FileSystem.FileSystem> {
  return Cell.run(doctrineCell(toolName, doctrineLoaded), { cwd, toolName, doctrineLoaded })
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
}
