import { it } from '@effect/vitest'
import { Supervisor } from '@systemfsoftware/effect-daemon-spec'
import { Match, Option } from 'effect'
import { Index, NonEmptyTrace, StartSwapCase } from '../../tests/__fixtures__/conformance-fixtures.schema.js'
import type { TraceComparison } from '../compare-traces.workflow.js'
import { compare } from '../compare.js'
import type { ChildRef, DecisionKind, ObservedCommand, ObservedEvent, ObservedStep } from '../Trace.schema.js'
import { ConformanceTrace } from '../Trace.schema.js'

type Declaration = Supervisor.Medium.MediumDeclaration

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

const conformHolds = (comparison: TraceComparison): boolean =>
  Match.value(comparison).pipe(
    Match.tag('TracesConform', () => true),
    Match.orElse(() => false),
  )

const divergenceIndexOf = (comparison: TraceComparison): Option.Option<number> =>
  Match.value(comparison).pipe(
    Match.tag('TracesDiverge', (diverged) => Option.some(diverged.index)),
    Match.orElse(() => Option.none<number>()),
  )

const divergedAtHolds = (
  reference: ConformanceTrace,
  candidate: ConformanceTrace,
  declaration: Declaration,
  expected: number,
): boolean =>
  Option.match(divergenceIndexOf(compare(reference, candidate, declaration)), {
    onSome: (index) => index === expected,
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
  [ConformanceTrace, Supervisor.Medium.MediumDeclaration],
  ([trace, declaration]) => conformHolds(compare(trace, trace, declaration)),
)

it.prop(
  '∀t_DivergentDecision_≡FirstIndex',
  [NonEmptyTrace, Index, Supervisor.Medium.MediumDeclaration],
  ([trace, index, declaration]) => {
    const position = positionOf(index, trace.steps.length)
    return divergedAtHolds(trace, divergeAt(trace, position), declaration, position)
  },
)

it.prop(
  '∀s_EventualStarts_=Diverge',
  [StartSwapCase],
  ([parts]) => {
    const swapped = swappedStartsOf(parts)
    return !conformHolds(compare(swapped.reference, swapped.candidate, EVENTUAL))
  },
)
