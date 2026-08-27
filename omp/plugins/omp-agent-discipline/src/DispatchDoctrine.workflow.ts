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
    Match.when(true, () => new DeliverDoctrine({ reason: DOCTRINE_KERNEL })),
    Match.when(false, () => new Allow()),
    Match.exhaustive,
  )

export const checkDispatchDoctrine = Workflow.make(
  CheckDispatchCommand,
  (command): Result.Result<DispatchDoctrineVerdict, DispatchDoctrineImpossible> =>
    Result.succeed(decideDispatchDoctrine(command)),
)
