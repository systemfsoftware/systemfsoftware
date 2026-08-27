import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result, Schema as S } from 'effect'

const DELEGATOR_TOOLS: Readonly<Record<string, true>> = { task: true, agent: true }

const isDelegatorTool = (name: string): boolean => DELEGATOR_TOOLS[name.trim().toLowerCase()] === true

const CheckDispatchCommandTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-agent-discipline/CheckDispatchCommand',
)

export class CheckDispatchCommand extends S.TaggedClass<CheckDispatchCommand>()('CheckDispatchCommand', {
  toolName: S.String,
  doctrineLoaded: S.Boolean,
  gateEnabled: S.Boolean,
}) {
  readonly [CheckDispatchCommandTypeId] = CheckDispatchCommandTypeId
}

const DispatchDoctrineVerdictTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/omp-agent-discipline/DispatchDoctrineVerdict',
)

export class Allow extends S.TaggedClass<Allow>()('Allow', {}) {
  readonly [DispatchDoctrineVerdictTypeId] = DispatchDoctrineVerdictTypeId
}

export class DeliverDoctrine extends S.TaggedClass<DeliverDoctrine>()('DeliverDoctrine', {
  reason: S.String,
}) {
  readonly [DispatchDoctrineVerdictTypeId] = DispatchDoctrineVerdictTypeId
}

export const DispatchDoctrineVerdict = S.Union([Allow, DeliverDoctrine])
export type DispatchDoctrineVerdict = S.Schema.Type<typeof DispatchDoctrineVerdict>

export class DispatchDoctrineImpossible extends S.TaggedError<DispatchDoctrineImpossible>()(
  'DispatchDoctrineImpossible',
  { reason: S.String },
) {}

export const DOCTRINE_KERNEL =
  `Refuse monolithic dispatches: size the unit, specify it completely, then dispatch — or do the work inline.

rules:
- GATE: decomposition is mandatory when ANY hold — multi-subsystem; exceeds one focused session for the worker's model class; irreversible side effects; verification longer than the work; incompatible reasoning modes. Dispatching monolithically anyway is an invalid dispatch: split, or do it yourself.
- SPEC: every dispatched unit carries objective, write_scope, verify_commands, acceptance, size_estimate, context_paths, rollback, dependencies — written before work starts. Missing any field is undispatchable.
- CHECK: verifier is not the maker. Run each unit's verify commands fresh in your own context; never accept a worker's reported output or completeness claims. A verify failure rejects the unit: record the failure, re-dispatch with the evidence.
- FENCE: parallel units need disjoint write scopes, confirmed by comparing write_scope declarations literally — never inferred from topic. Overlap forces serialization.

Full doctrine: skill://task-decomposition — sizing calibration, the dispatch contract, rejection rules, repair-retry. Refuse monolithic dispatches: size, specify, then dispatch or refuse.`

const dispatchIsBlocked = (cmd: CheckDispatchCommand): boolean =>
  cmd.gateEnabled && isDelegatorTool(cmd.toolName) && !cmd.doctrineLoaded

export const decideDispatchDoctrine = (cmd: CheckDispatchCommand): DispatchDoctrineVerdict =>
  Match.value(dispatchIsBlocked(cmd)).pipe(
    Match.when(true, () => DeliverDoctrine.make({ reason: DOCTRINE_KERNEL })),
    Match.when(false, () => Allow.make()),
    Match.exhaustive,
  )

export const checkDispatchDoctrine = Workflow.make(
  CheckDispatchCommand,
  (command): Result.Result<DispatchDoctrineVerdict, DispatchDoctrineImpossible> =>
    Result.succeed(decideDispatchDoctrine(command)),
)

// ── Pure helpers — previously in DispatchDoctrine.ts ──

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

/**
 * Recognize a read-path that targets a doctrine skill. Pure-string only.
 */
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
