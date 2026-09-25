import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { it } from '@systemfsoftware/vitest'
import { Match, Option } from 'effect'
import { Index, NonEmptyTrace, StartSwapCase } from '../../tests/__fixtures__/conformance-fixtures.fixture.js'
import type { TraceComparison } from '../compare-traces.workflow.js'
import { compare } from '../compare.js'
import type { ChildRef, DecisionKind, ObservedCommand, ObservedEvent, ObservedStep } from '../Trace.schema.js'
import { ConformanceTrace } from '../Trace.schema.js'

type Declaration = Supervisor.Medium.MediumDeclaration
type Compare = typeof compare

const EVENTUAL: Declaration = { reporting: 'full', groupStop: 'eventual' }

const NEXT_DECISION_KIND: Record<string, DecisionKind | undefined> = {
  Stale: 'Continue',
  Continue: 'RestartChildren',
  RestartChildren: 'StartChildren',
  StartChildren: 'CoolDown',
  CoolDown: 'StopChildren',
  StopChildren: 'Terminate',
  Terminate: 'RefuseDynamicStart',
  RefuseDynamicStart: 'Stale',
}

const rotatedKindOf = (kind: DecisionKind): DecisionKind =>
  Option.getOrElse(Option.fromNullishOr(NEXT_DECISION_KIND[kind]), () => kind)

const mutatedDecision = (step: ObservedStep): ObservedStep => ({
  ...step,
  decision: { ...step.decision, kind: rotatedKindOf(step.decision.kind) },
})

const stepAt = (step: ObservedStep, index: number, position: number): ObservedStep =>
  Option.getOrElse(
    Option.filter(Option.some(mutatedDecision(step)), () => index === position),
    () => step,
  )

const divergeAt = (trace: ConformanceTrace, position: number): ConformanceTrace => ({
  ...trace,
  steps: trace.steps.map((step, index) => stepAt(step, index, position)),
})

const positionOf = (index: number, length: number): number => index % Math.max(length, 1)

type Divergence = {
  readonly index: number
  readonly scenario: string
  readonly medium: string
}

const comparedCountOf = (comparison: TraceComparison): Option.Option<number> =>
  Match.value(comparison).pipe(
    Match.tag('TracesConform', (conformed) => Option.some(conformed.compared)),
    Match.orElse(() => Option.none<number>()),
  )

const divergenceOf = (comparison: TraceComparison): Option.Option<Divergence> =>
  Match.value(comparison).pipe(
    Match.tag('TracesDiverge', (diverged) =>
      Option.some({ index: diverged.index, scenario: diverged.scenario, medium: diverged.medium })),
    Match.orElse(() =>
      Option.none<Divergence>()
    ),
  )

const divergedAtHolds = (
  subject: Compare,
  reference: ConformanceTrace,
  candidate: ConformanceTrace,
  declaration: Declaration,
  expected: number,
): boolean =>
  Option.match(divergenceOf(subject(reference, candidate, declaration)), {
    onSome: (diverged) => diverged.index === expected,
    onNone: () => false,
  })

const startCommand = (ref: ChildRef): ObservedCommand => ({ kind: 'StartChild', child: ref })

const swappedStartsOf = (parts: StartSwapCase): { reference: ConformanceTrace; candidate: ConformanceTrace } => {
  const second: ChildRef = { childId: `${parts.first.childId}${parts.suffix}`, generation: parts.first.generation }
  const event: ObservedEvent = { kind: 'ChildStarted', child: parts.first, reason: null }
  const steps: ReadonlyArray<ObservedStep> = [
    { event, decision: { kind: 'StartChildren', commands: [startCommand(parts.first), startCommand(second)] } },
  ]
  const swapped: ReadonlyArray<ObservedStep> = [
    { event, decision: { kind: 'StartChildren', commands: [startCommand(second), startCommand(parts.first)] } },
  ]
  return {
    reference: { scenario: parts.scenario, medium: parts.medium, steps },
    candidate: { scenario: parts.scenario, medium: parts.medium, steps: swapped },
  }
}

it.prop(
  '∀t_Compare_=Reflexive',
  { of: [ConformanceTrace, Supervisor.Medium.MediumDeclaration], subject: compare },
  (subject, [trace, declaration]) =>
    Option.match(comparedCountOf(subject(trace, trace, declaration)), {
      onSome: (compared) => compared === trace.steps.length,
      onNone: () => false,
    }),
)

it.prop(
  '∀t_DivergentDecision_≡FirstIndex',
  { of: [NonEmptyTrace, Index, Supervisor.Medium.MediumDeclaration], subject: compare },
  (subject, [trace, index, declaration]) => {
    const position = positionOf(index, trace.steps.length)
    return divergedAtHolds(subject, trace, divergeAt(trace, position), declaration, position)
  },
)

it.prop(
  '∀s_EventualStarts_=Diverge',
  { of: [StartSwapCase], subject: compare },
  (subject, [parts]) => {
    const swapped = swappedStartsOf(parts)
    return Option.match(divergenceOf(subject(swapped.reference, swapped.candidate, EVENTUAL)), {
      onSome: (diverged) =>
        diverged.index === 0 && diverged.scenario === parts.scenario && diverged.medium === parts.medium,
      onNone: () => false,
    })
  },
)
