import { it } from '@effect/vitest'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Array as Arr, Match, Result } from 'effect'
import { ProjectTrace, projectTrace, type TraceProjection } from '../project-trace.workflow.js'
import type { ObservedCommand, ObservedStep } from '../Trace.schema.js'
import { ConformanceTrace } from '../Trace.schema.js'

type Declaration = Supervisor.Medium.MediumDeclaration

const STRICT: Declaration = { reporting: 'full', groupStop: 'atomic' }

const canonicalOf = (steps: ReadonlyArray<ObservedStep>): string => JSON.stringify(steps)

const projectedOf = (trace: ConformanceTrace, declaration: Declaration): TraceProjection =>
  Result.getOrThrow(projectTrace(new ProjectTrace({ trace, declaration })))

const identityHolds = (projection: TraceProjection, trace: ConformanceTrace): boolean =>
  Match.value(projection).pipe(
    Match.tag('TracePreserved', () => canonicalOf(projection.steps) === canonicalOf(trace.steps)),
    Match.orElse(() => false),
  )

const lengthHolds = (projection: TraceProjection, trace: ConformanceTrace): boolean =>
  projection.steps.length === trace.steps.length

const idempotentHolds = (trace: ConformanceTrace, declaration: Declaration): boolean => {
  const once = projectedOf(trace, declaration).steps
  const twice = projectedOf({ ...trace, steps: once }, declaration).steps
  return canonicalOf(once) === canonicalOf(twice)
}

const isStartCommand = (command: ObservedCommand): boolean => command.kind === 'StartChild'

const startKeyOf = (command: ObservedCommand): string => `StartChild:${JSON.stringify(command.child)}`

const startSequenceOf = (steps: ReadonlyArray<ObservedStep>): ReadonlyArray<string> =>
  Arr.flatMap(steps, (step) => Arr.map(Arr.filter(step.decision.commands, isStartCommand), startKeyOf))

const startsPreserved = (trace: ConformanceTrace, declaration: Declaration): boolean =>
  Arr.join(startSequenceOf(projectedOf(trace, declaration).steps), '|') ===
    Arr.join(startSequenceOf(trace.steps), '|')

it.prop(
  '∀t_StrictProjection_≡Identity',
  [ConformanceTrace],
  ([trace]) => identityHolds(projectedOf(trace, STRICT), trace),
)

it.prop(
  '∀t_Projection_≡Length',
  [ConformanceTrace, Supervisor.Medium.MediumDeclaration],
  ([trace, declaration]) => lengthHolds(projectedOf(trace, declaration), trace),
)

it.prop(
  '∀t_Projection_=Idempotent',
  [ConformanceTrace, Supervisor.Medium.MediumDeclaration],
  ([trace, declaration]) => idempotentHolds(trace, declaration),
)

it.prop(
  '∀t_Projection_=StartOrderPreserved',
  [ConformanceTrace, Supervisor.Medium.MediumDeclaration],
  ([trace, declaration]) => startsPreserved(trace, declaration),
)
