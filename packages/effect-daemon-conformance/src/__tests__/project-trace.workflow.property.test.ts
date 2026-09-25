import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/vitest'
import { Array as Arr, Match, Result } from 'effect'
import { ProjectTrace, projectTrace, type TraceProjection } from '../project-trace.workflow.js'
import type { ObservedCommand, ObservedStep } from '../Trace.schema.js'
import { ConformanceTrace } from '../Trace.schema.js'

type Declaration = Supervisor.Medium.MediumDeclaration
type Project = typeof projectTrace

const STRICT: Declaration = { reporting: 'full', groupStop: 'atomic' }

const canonicalOf = (steps: ReadonlyArray<ObservedStep>): string => JSON.stringify(steps)

const projectedOf = (subject: Project, trace: ConformanceTrace, declaration: Declaration): TraceProjection =>
  Result.getOrThrow(subject(new ProjectTrace({ trace, declaration })))

const identityHolds = (projection: TraceProjection, trace: ConformanceTrace): boolean =>
  Match.value(projection).pipe(
    Match.tag('TracePreserved', () => canonicalOf(projection.steps) === canonicalOf(trace.steps)),
    Match.orElse(() => false),
  )

const lengthHolds = (projection: TraceProjection, trace: ConformanceTrace): boolean =>
  projection.steps.length === trace.steps.length

const idempotentHolds = (subject: Project, trace: ConformanceTrace, declaration: Declaration): boolean => {
  const once = projectedOf(subject, trace, declaration).steps
  const twice = projectedOf(subject, { ...trace, steps: once }, declaration).steps
  return canonicalOf(once) === canonicalOf(twice) && once.length === trace.steps.length
}

const isStartCommand = (command: ObservedCommand): boolean => command.kind === 'StartChild'

const startKeyOf = (command: ObservedCommand): string => `StartChild:${JSON.stringify(command.child)}`

const startSequenceOf = (steps: ReadonlyArray<ObservedStep>): ReadonlyArray<string> =>
  Arr.flatMap(steps, (step) => Arr.map(Arr.filter(step.decision.commands, isStartCommand), startKeyOf))

const startsPreserved = (subject: Project, trace: ConformanceTrace, declaration: Declaration): boolean =>
  Arr.join(startSequenceOf(projectedOf(subject, trace, declaration).steps), '|') ===
    Arr.join(startSequenceOf(trace.steps), '|')

it.prop(
  '∀t_StrictProjection_≡Identity',
  { of: [ConformanceTrace], subject: projectTrace },
  (subject, [trace]) => identityHolds(projectedOf(subject, trace, STRICT), trace),
)

it.prop(
  '∀t_Projection_≡Length',
  { of: [ConformanceTrace, Supervisor.Medium.MediumDeclaration], subject: projectTrace },
  (subject, [trace, declaration]) => lengthHolds(projectedOf(subject, trace, declaration), trace),
)

it.prop(
  '∀t_Projection_=Idempotent',
  { of: [ConformanceTrace, Supervisor.Medium.MediumDeclaration], subject: projectTrace },
  (subject, [trace, declaration]) => idempotentHolds(subject, trace, declaration),
)

it.prop(
  '∀t_Projection_=StartOrderPreserved',
  { of: [ConformanceTrace, Supervisor.Medium.MediumDeclaration], subject: projectTrace },
  (subject, [trace, declaration]) => startsPreserved(subject, trace, declaration),
)
