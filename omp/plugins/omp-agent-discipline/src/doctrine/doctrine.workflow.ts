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

export class DeliverDoctrine extends S.TaggedClass<DeliverDoctrine>()('DeliverDoctrine', {}) {
  readonly [DispatchDoctrineVerdictTypeId] = DispatchDoctrineVerdictTypeId
}

export const DispatchDoctrineVerdict = S.Union([Allow, DeliverDoctrine])
export type DispatchDoctrineVerdict = S.Schema.Type<typeof DispatchDoctrineVerdict>

export class DispatchDoctrineImpossible extends S.TaggedError<DispatchDoctrineImpossible>()(
  'DispatchDoctrineImpossible',
  { reason: S.String },
) {}

const dispatchIsBlocked = (cmd: CheckDispatchCommand): boolean =>
  cmd.gateEnabled && isDelegatorTool(cmd.toolName) && !cmd.doctrineLoaded

const decideDispatchDoctrine = (cmd: CheckDispatchCommand): DispatchDoctrineVerdict =>
  Match.value(dispatchIsBlocked(cmd)).pipe(
    Match.when(true, () => DeliverDoctrine.make()),
    Match.when(false, () => Allow.make()),
    Match.exhaustive,
  )

export const checkDispatchDoctrine = Workflow.make(
  CheckDispatchCommand,
  (command): Result.Result<DispatchDoctrineVerdict, DispatchDoctrineImpossible> =>
    Result.succeed(decideDispatchDoctrine(command)),
)
