import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { type Action } from '../../engine/action.schema.js'
import { type Observation } from '../../engine/observation.schema.js'
import { type Route } from '../../engine/route.schema.js'
import { type SemanticNode } from '../../engine/semantic-node.schema.js'
import { FailureCode } from '../../verdict/failure.schema.js'
import {
  ClassifyReplay,
  classifyReplay,
  type ReplayDecision,
  type ReplayOutcome,
  type ReplayStep,
  type ReplayStopReason,
  type ReplayTranscript,
} from '../classify-replay.workflow.js'
import { type Anchor, type ControlDescriptor, type RecordedAction, TraceEntry } from '../entry.schema.js'

type Classify = typeof classifyReplay

const PERFORMED: ReplayOutcome = { _tag: 'Performed' }

const NEUTRAL_STATES: SemanticNode['states'] = { disabled: false, hidden: false }

const SCREENSHOT_ACTION: Action = { _tag: 'Screenshot', label: 'replay' }

const decisionOf = (classify: Classify, command: ClassifyReplay): ReplayDecision =>
  Result.match(classify(command), { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const controlOf = (actionIndex: number, controlIndex: number): ControlDescriptor => ({
  role: `replay-role-${String(actionIndex)}-${String(controlIndex)}`,
  name: `replay-control-${String(actionIndex)}-${String(controlIndex)}`,
  context: [`replay-context-${String(actionIndex)}-${String(controlIndex)}`],
})

const anchorControlOf = (kind: 'appeared' | 'gone', index: number): ControlDescriptor => ({
  role: `replay-anchor-role-${kind}-${String(index)}`,
  name: `replay-anchor-${kind}-${String(index)}`,
  context: [`replay-anchor-context-${kind}-${String(index)}`],
})

const nodeOf = (
  id: string,
  role: string | undefined,
  name: string | undefined,
  states: SemanticNode['states'],
  children: ReadonlyArray<SemanticNode>,
): SemanticNode => ({
  ref: { id, revision: 'replay' },
  ...(role === undefined ? {} : { role }),
  ...(name === undefined ? {} : { name }),
  states,
  children,
})

const chainOf = (names: ReadonlyArray<string>, leaf: SemanticNode): SemanticNode =>
  names.reduceRight((node, name) => nodeOf(`ancestor:${name}`, undefined, name, NEUTRAL_STATES, [node]), leaf)

const controlChainOf = (control: ControlDescriptor): SemanticNode =>
  chainOf(control.context, nodeOf(`node:${control.name}`, control.role, control.name, NEUTRAL_STATES, []))

const anchorChainOf = (anchor: Anchor): SemanticNode =>
  chainOf(
    anchor.control.context,
    nodeOf(`node:${anchor.control.name}`, anchor.control.role, anchor.control.name, {
      ...NEUTRAL_STATES,
      ...anchor.states,
    }, []),
  )

const observationOf = (route: Route, tree: ReadonlyArray<SemanticNode>): Observation => ({
  route,
  revision: 'replay',
  tree,
})

const stepTreeOf = (recorded: RecordedAction): ReadonlyArray<SemanticNode> => recorded.controls.map(controlChainOf)

const movedRouteOf = (route: Route): Route => ({
  origin: route.origin,
  path: `${route.path}/moved`,
  query: [],
})

const withControlFallbackOf = (mapped: ReadonlyArray<RecordedAction>): ReadonlyArray<RecordedAction> =>
  Option.match(Arr.head(mapped), {
    onNone: () => [{ action: SCREENSHOT_ACTION, controls: [controlOf(0, 0)] }],
    onSome: (first) =>
      Arr.some(mapped, (recorded) => recorded.controls.length > 0)
        ? mapped
        : [{ action: first.action, controls: [controlOf(0, 0)] }, ...mapped.slice(1)],
  })

const withAnchorFallbackOf = (appeared: ReadonlyArray<Anchor>): ReadonlyArray<Anchor> =>
  Arr.isReadonlyArrayNonEmpty(appeared) ? appeared : [{ control: anchorControlOf('appeared', 0), states: {} }]

const withReplayableFlowOf = (drawn: TraceEntry): TraceEntry => ({
  schema: 'trace-1',
  keyedBy: drawn.keyedBy,
  start: drawn.start,
  actions: withControlFallbackOf(
    drawn.actions.map((recorded, actionIndex) => ({
      action: recorded.action,
      controls: recorded.controls.map((_, controlIndex) => controlOf(actionIndex, controlIndex)),
    })),
  ),
  end: movedRouteOf(drawn.start),
  anchors: {
    appeared: withAnchorFallbackOf(drawn.anchors.appeared.map((anchor, index) => ({
      control: anchorControlOf('appeared', index),
      states: anchor.states,
    }))),
    gone: drawn.anchors.gone.map((anchor, index) => ({
      control: anchorControlOf('gone', index),
      states: anchor.states,
    })),
  },
  checks: drawn.checks,
  alerts: drawn.alerts,
  provenance: drawn.provenance,
})

const replayTranscriptOf = (entry: TraceEntry): ReplayTranscript => ({
  start: observationOf(entry.start, []),
  steps: entry.actions.map((recorded) => ({
    observation: observationOf(entry.start, stepTreeOf(recorded)),
    outcome: PERFORMED,
  })),
  end: observationOf(entry.end, entry.anchors.appeared.map(anchorChainOf)),
  alerts: entry.alerts,
})

const controlledIndexesOf = (entry: TraceEntry): ReadonlyArray<number> =>
  entry.actions.flatMap((recorded, index) => recorded.controls.length === 0 ? [] : [index])

const controlledIndexOf = (entry: TraceEntry, picked: number): number => {
  const candidates = controlledIndexesOf(entry)
  return candidates[Math.abs(picked) % candidates.length] ?? 0
}

const renamedTreeOf = (recorded: RecordedAction): ReadonlyArray<SemanticNode> =>
  Option.match(Arr.head(recorded.controls), {
    onNone: () => [],
    onSome: (first) => [
      chainOf(first.context, nodeOf(`node:${first.name}`, first.role, `${first.name}-renamed`, NEUTRAL_STATES, [])),
      ...recorded.controls.slice(1).map(controlChainOf),
    ],
  })

const duplicatedTreeOf = (recorded: RecordedAction): ReadonlyArray<SemanticNode> =>
  Option.match(Arr.head(recorded.controls), {
    onNone: () => [],
    onSome: (first) => [...recorded.controls.map(controlChainOf), controlChainOf(first)],
  })

const stepsWhereTreeOf = (
  entry: TraceEntry,
  index: number,
  treeOf: (recorded: RecordedAction) => ReadonlyArray<SemanticNode>,
): ReadonlyArray<ReplayStep> =>
  entry.actions.map((recorded, at) => ({
    observation: observationOf(entry.start, at === index ? treeOf(recorded) : stepTreeOf(recorded)),
    outcome: PERFORMED,
  }))

const offCommandOf = (transcript: ReplayTranscript, entry: TraceEntry | undefined): ClassifyReplay =>
  entry === undefined
    ? new ClassifyReplay({ mode: 'off', transcript })
    : new ClassifyReplay({ mode: 'off', entry, transcript })

const isMiss = (decision: ReplayDecision): boolean =>
  Match.value(decision).pipe(Match.tag('Miss', () => true), Match.orElse(() => false))

const isReplayDecision = (decision: ReplayDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('Miss', () => true),
    Match.tag('Replayed', () => true),
    Match.tag('HandOff', () => true),
    Match.exhaustive,
  )

const isReplayedWith = (decision: ReplayDecision, actions: ReadonlyArray<Action>): boolean =>
  Match.value(decision).pipe(
    Match.tag('Replayed', (replayed) => JSON.stringify(replayed.actions) === JSON.stringify(actions)),
    Match.orElse(() => false),
  )

const isNoChangeHandOff = (decision: ReplayDecision, prefixLength: number): boolean =>
  Match.value(decision).pipe(
    Match.tag('HandOff', (handOff) =>
      Match.value(handOff.reason).pipe(
        Match.tag('NoChangeEvidenced', () => handOff.prefix.length === prefixLength),
        Match.orElse(() => false),
      )),
    Match.orElse(() => false),
  )

const reasonNamesControl = (
  reason: ReplayStopReason,
  tag: 'ControlMissing' | 'ControlAmbiguous',
  control: ControlDescriptor,
): boolean =>
  Match.value(reason).pipe(
    Match.tag('ControlMissing', (missing) =>
      tag === 'ControlMissing' && JSON.stringify(missing.control) === JSON.stringify(control)),
    Match.tag('ControlAmbiguous', (ambiguous) =>
      tag === 'ControlAmbiguous' && JSON.stringify(ambiguous.control) === JSON.stringify(control)),
    Match.orElse(() =>
      false
    ),
  )

const handOffNamed = (
  decision: ReplayDecision,
  tag: 'ControlMissing' | 'ControlAmbiguous',
  control: ControlDescriptor,
  prefixLength: number,
): boolean =>
  Match.value(decision).pipe(
    Match.tag('HandOff', (handOff) =>
      reasonNamesControl(handOff.reason, tag, control) && handOff.prefix.length === prefixLength),
    Match.orElse(() =>
      false
    ),
  )

const handOffWithReason = (
  decision: ReplayDecision,
  reason: ReplayStopReason,
  prefixLength: number,
): boolean =>
  Match.value(decision).pipe(
    Match.tag('HandOff', (handOff) =>
      handOff.prefix.length === prefixLength && JSON.stringify(handOff.reason) === JSON.stringify(reason)),
    Match.orElse(() =>
      false
    ),
  )

const sameAnchorStates = (left: Anchor['states'], right: Anchor['states']): boolean =>
  left.checked === right.checked && left.selected === right.selected && left.expanded === right.expanded &&
  left.pressed === right.pressed

const anchorMissingNamed = (decision: ReplayDecision, anchor: Anchor, prefixLength: number): boolean =>
  Match.value(decision).pipe(
    Match.tag('HandOff', (handOff) =>
      Match.value(handOff.reason).pipe(
        Match.tag('AnchorMissing', (missing) =>
          handOff.prefix.length === prefixLength &&
          JSON.stringify(missing.anchor.control) === JSON.stringify(anchor.control) &&
          sameAnchorStates(missing.anchor.states, anchor.states)),
        Match.orElse(() => false),
      )),
    Match.orElse(() => false),
  )

const stepsWithOutcomeOf = (
  steps: ReadonlyArray<ReplayStep>,
  index: number,
  outcome: ReplayOutcome,
): ReadonlyArray<ReplayStep> => steps.map((step, at) => at === index ? { ...step, outcome } : step)

const endTreeWithoutOf = (entry: TraceEntry, skip: number): ReadonlyArray<SemanticNode> =>
  entry.anchors.appeared.flatMap((anchor, at) => at === skip ? [] : [anchorChainOf(anchor)])

const UNRECORDED_ALERT_MARKER = 'replay-never-recorded:'

const unrecordedAlertOf = (text: string): string => `${UNRECORDED_ALERT_MARKER}${text}`

it.prop(
  '∀t_ClassifyReplay_≡Deterministic',
  { of: [ClassifyReplay], subject: classifyReplay, arbitrary: { seed: 498_021 } },
  (subject, [drawn]) => {
    const first = decisionOf(subject, drawn)
    return isReplayDecision(first) && JSON.stringify(first) === JSON.stringify(decisionOf(subject, drawn))
  },
)

it.prop(
  '∀t_ClassifyReplay_→HandOffNamesControl',
  { of: [TraceEntry, Schema.Int], subject: classifyReplay, arbitrary: { seed: 498_022 } },
  (subject, [drawn, picked]) => {
    const entry = withReplayableFlowOf(drawn)
    const index = controlledIndexOf(entry, picked)
    const control = controlOf(index, 0)
    const base = replayTranscriptOf(entry)
    const renamed = decisionOf(
      subject,
      new ClassifyReplay({
        mode: 'read-write',
        entry,
        transcript: { ...base, steps: stepsWhereTreeOf(entry, index, renamedTreeOf) },
      }),
    )
    const duplicated = decisionOf(
      subject,
      new ClassifyReplay({
        mode: 'read-write',
        entry,
        transcript: { ...base, steps: stepsWhereTreeOf(entry, index, duplicatedTreeOf) },
      }),
    )
    return handOffNamed(renamed, 'ControlMissing', control, index) &&
      handOffNamed(duplicated, 'ControlAmbiguous', control, index)
  },
)

it.prop(
  '∀t_ClassifyReplay_≡ReplayedWhenAllRulesHold',
  { of: [TraceEntry], subject: classifyReplay, arbitrary: { seed: 498_023 } },
  (subject, [drawn]) => {
    const entry = withReplayableFlowOf(drawn)
    const decision = decisionOf(
      subject,
      new ClassifyReplay({
        mode: 'read-write',
        entry,
        transcript: replayTranscriptOf(entry),
      }),
    )
    return isReplayedWith(decision, entry.actions.map((recorded) => recorded.action))
  },
)

it.prop(
  '∀t_ClassifyReplay_¬PreexistingStateProves',
  { of: [TraceEntry], subject: classifyReplay, arbitrary: { seed: 498_024 } },
  (subject, [drawn]) => {
    const stale = withReplayableFlowOf(drawn)
    const decision = decisionOf(
      subject,
      new ClassifyReplay({
        mode: 'read-write',
        entry: stale,
        transcript: {
          ...replayTranscriptOf(stale),
          start: observationOf(stale.start, stale.anchors.appeared.map(anchorChainOf)),
        },
      }),
    )
    return isNoChangeHandOff(decision, stale.actions.length)
  },
)

it.prop(
  '∀m_ClassifyReplay_≡MissWithoutEntry',
  { of: [ClassifyReplay], subject: classifyReplay, arbitrary: { seed: 498_025 } },
  (subject, [drawn]) => {
    const withoutEntry = decisionOf(
      subject,
      new ClassifyReplay({
        mode: 'read-only',
        transcript: drawn.transcript,
      }),
    )
    const off = decisionOf(subject, offCommandOf(drawn.transcript, drawn.entry))
    return isMiss(withoutEntry) && isMiss(off)
  },
)

it.prop(
  '∀t_ClassifyReplay_→RouteMismatchStops',
  { of: [TraceEntry], subject: classifyReplay, arbitrary: { seed: 498_026 } },
  (subject, [drawn]) => {
    const entry = withReplayableFlowOf(drawn)
    const base = replayTranscriptOf(entry)
    const startMoved = decisionOf(
      subject,
      new ClassifyReplay({
        mode: 'read-write',
        entry,
        transcript: { ...base, start: observationOf(movedRouteOf(entry.start), []) },
      }),
    )
    const endMoved = decisionOf(
      subject,
      new ClassifyReplay({
        mode: 'read-write',
        entry,
        transcript: { ...base, end: observationOf(movedRouteOf(entry.end), base.end.tree) },
      }),
    )
    return handOffWithReason(startMoved, { _tag: 'RouteChanged' }, 0) &&
      handOffWithReason(endMoved, { _tag: 'EndRouteChanged' }, entry.actions.length)
  },
)

it.prop(
  '∀t_ClassifyReplay_→StepOutcomeStops',
  { of: [TraceEntry, FailureCode, Schema.Int], subject: classifyReplay, arbitrary: { seed: 498_027 } },
  (subject, [drawn, code, picked]) => {
    const entry = withReplayableFlowOf(drawn)
    const index = controlledIndexOf(entry, picked)
    const base = replayTranscriptOf(entry)
    const rejected = decisionOf(
      subject,
      new ClassifyReplay({
        mode: 'read-write',
        entry,
        transcript: { ...base, steps: stepsWithOutcomeOf(base.steps, index, { _tag: 'Rejected', code }) },
      }),
    )
    const notRun = decisionOf(
      subject,
      new ClassifyReplay({
        mode: 'read-write',
        entry,
        transcript: { ...base, steps: stepsWithOutcomeOf(base.steps, index, { _tag: 'NotRun' }) },
      }),
    )
    return handOffWithReason(rejected, { _tag: 'ActionRejected', code }, index) &&
      handOffWithReason(notRun, { _tag: 'ActionNotRun' }, index)
  },
)

it.prop(
  '∀t_ClassifyReplay_→MissingAnchorStops',
  { of: [TraceEntry, Schema.Int], subject: classifyReplay, arbitrary: { seed: 498_028 } },
  (subject, [drawn, picked]) => {
    const entry = withReplayableFlowOf(drawn)
    const index = Math.abs(picked) % entry.anchors.appeared.length
    const missing = entry.anchors.appeared[index]
    const decision = decisionOf(
      subject,
      new ClassifyReplay({
        mode: 'read-write',
        entry,
        transcript: {
          ...replayTranscriptOf(entry),
          end: observationOf(entry.end, endTreeWithoutOf(entry, index)),
        },
      }),
    )
    return missing !== undefined && anchorMissingNamed(decision, missing, entry.actions.length)
  },
)

it.prop(
  '∀t_ClassifyReplay_→UnexpectedAlertStops',
  { of: [TraceEntry, Schema.String], subject: classifyReplay, arbitrary: { seed: 498_029 } },
  (subject, [drawn, text]) => {
    const entry = withReplayableFlowOf(drawn)
    const base = replayTranscriptOf(entry)
    const alert = unrecordedAlertOf(text)
    const decision = decisionOf(
      subject,
      new ClassifyReplay({
        mode: 'read-write',
        entry,
        transcript: { ...base, alerts: [...base.alerts, alert] },
      }),
    )
    return handOffWithReason(decision, { _tag: 'UnexpectedAlert', text: alert }, entry.actions.length)
  },
)
