import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Array as Arr, Option, Order, Result, Schema } from 'effect'
import type { ChildRef, ObservedCommand, ObservedEvent, ObservedStep, ReasonKind } from './Trace.schema.js'
import { ConformanceTrace, ObservedStep as ObservedStepSchema } from './Trace.schema.js'

const ProjectionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-daemon-conformance/TraceProjection')
type ProjectionTypeId = typeof ProjectionTypeId

/** A declaration demanded no loss: the projected steps equal the trace's own. */
export class TracePreserved extends Schema.TaggedClass<TracePreserved>()('TracePreserved', {
  steps: Schema.Array(ObservedStepSchema),
}) {
  readonly [ProjectionTypeId] = ProjectionTypeId
}

/** A declaration erased something: a report was coarsened or a stop order relaxed. */
export class TraceReduced extends Schema.TaggedClass<TraceReduced>()('TraceReduced', {
  steps: Schema.Array(ObservedStepSchema),
}) {
  readonly [ProjectionTypeId] = ProjectionTypeId
}

export const TraceProjection = Schema.Union([TracePreserved, TraceReduced])
export type TraceProjection = typeof TraceProjection.Type

export class ProjectTrace extends Schema.TaggedClass<ProjectTrace>()('ProjectTrace', {
  trace: ConformanceTrace,
  declaration: Supervisor.Medium.MediumDeclaration,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

/** The failure tag each reporting level reduces a medium-supplied report to; `full` keeps the tag. */
const COARSENED_BY_REPORTING: Record<string, ReasonKind | undefined> = {
  exit: 'ExitReport',
  inferred: 'InferredReport',
}

/** Reasons the kernel mints itself; no reporting level may reduce them away. */
const KERNEL_OWNED_REASONS: Record<string, true> = {
  Normal: true,
  Shutdown: true,
  DeadlineMissed: true,
}

const isKernelOwnedReason = (reason: ReasonKind): boolean => KERNEL_OWNED_REASONS[reason] === true

const isStopCommand = (command: ObservedCommand): boolean => command.kind === 'StopChild'

const isNotStopCommand = (command: ObservedCommand): boolean => !isStopCommand(command)

const childKeyOf = (child: ChildRef | null): string =>
  Option.match(Option.fromNullishOr(child), {
    onNone: () => '',
    onSome: (ref) => `${ref.childId}#${ref.generation}`,
  })

const commandChildKeyOf = (command: ObservedCommand): string => childKeyOf(command.child)

const mediumLevelReason = (canonical: ReasonKind, reason: ReasonKind): ReasonKind =>
  Option.match(Option.filter(Option.some(canonical), () => isKernelOwnedReason(reason)), {
    onSome: () => reason,
    onNone: () => canonical,
  })

const coarsenedReasonOf = (
  reporting: Supervisor.Medium.MediumReporting,
  reason: ReasonKind,
): ReasonKind =>
  Option.match(Option.fromNullishOr(COARSENED_BY_REPORTING[reporting]), {
    onSome: (canonical) => mediumLevelReason(canonical, reason),
    onNone: () => reason,
  })

const projectedReasonOf = (
  reporting: Supervisor.Medium.MediumReporting,
  reason: ReasonKind | null,
): ReasonKind | null =>
  Option.match(Option.fromNullishOr(reason), {
    onNone: () => null,
    onSome: (present) => coarsenedReasonOf(reporting, present),
  })

const projectedEventOf = (
  reporting: Supervisor.Medium.MediumReporting,
  event: ObservedEvent,
): ObservedEvent => ({ ...event, reason: projectedReasonOf(reporting, event.reason) })

/**
 * `eventual` relaxes the order of the stops one decision emits and nothing
 * else. Stops are flattened ahead of every other command, so re-ordering them
 * among themselves can neither reorder a start nor move a start relative to a
 * stop.
 */
const reorderStopsOf = (commands: ReadonlyArray<ObservedCommand>): ReadonlyArray<ObservedCommand> =>
  Arr.appendAll(
    Arr.sortWith(Arr.filter(commands, isStopCommand), commandChildKeyOf, Order.String),
    Arr.filter(commands, isNotStopCommand),
  )

const projectedCommandsOf = (
  groupStop: Supervisor.Medium.GroupStopGuarantee,
  commands: ReadonlyArray<ObservedCommand>,
): ReadonlyArray<ObservedCommand> =>
  Option.match(Option.filter(Option.some(commands), () => groupStop === 'eventual'), {
    onSome: () => reorderStopsOf(commands),
    onNone: () => commands,
  })

const projectedStepOf = (
  declaration: Supervisor.Medium.MediumDeclaration,
  step: ObservedStep,
): ObservedStep => ({
  event: projectedEventOf(declaration.reporting, step.event),
  decision: {
    ...step.decision,
    commands: projectedCommandsOf(declaration.groupStop, step.decision.commands),
  },
})

const canonicalOf = (steps: ReadonlyArray<ObservedStep>): string => JSON.stringify(steps)

const isUnchanged = (original: ReadonlyArray<ObservedStep>, steps: ReadonlyArray<ObservedStep>): boolean =>
  canonicalOf(steps) === canonicalOf(original)

const projectionOf = (
  original: ReadonlyArray<ObservedStep>,
  steps: ReadonlyArray<ObservedStep>,
): TraceProjection =>
  Option.match(Option.filter(Option.some(steps), () => isUnchanged(original, steps)), {
    onSome: () => new TracePreserved({ steps }),
    onNone: () => new TraceReduced({ steps }),
  })

export const projectTrace = Workflow.make({
  command: ProjectTrace,
  decision: TraceProjection,
  error: Schema.Never,
  decide: (command): Result.Result<TraceProjection, never> =>
    Result.succeed(
      projectionOf(
        command.trace.steps,
        command.trace.steps.map((step) => projectedStepOf(command.declaration, step)),
      ),
    ),
})
