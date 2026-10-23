import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { CacheMode } from '../Config/config.schema.js'
import { Action } from '../engine/action.schema.js'
import { Observation } from '../engine/observation.schema.js'
import { sameRoute } from '../engine/route.schema.js'
import { SemanticNode } from '../engine/semantic-node.schema.js'
import { FailureCode } from '../verdict/failure.schema.js'
import { Anchor, ControlDescriptor, TraceEntry } from './entry.schema.js'

const ReplayDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/ReplayDecision')

export class Performed extends Schema.TaggedClass<Performed>()('Performed', {}) {}

export class Rejected extends Schema.TaggedClass<Rejected>()('Rejected', { code: FailureCode }) {}

export class NotRun extends Schema.TaggedClass<NotRun>()('NotRun', {}) {}

export const ReplayOutcome = Schema.Union([Performed, Rejected, NotRun])
export type ReplayOutcome = typeof ReplayOutcome.Type

export const ReplayStep = Schema.Struct({
  observation: Observation,
  outcome: ReplayOutcome,
})
export type ReplayStep = typeof ReplayStep.Type

export const ReplayTranscript = Schema.Struct({
  start: Observation,
  steps: Schema.Array(ReplayStep),
  end: Observation,
  alerts: Schema.Array(Schema.String),
})
export type ReplayTranscript = typeof ReplayTranscript.Type

export class RouteChanged extends Schema.TaggedClass<RouteChanged>()('RouteChanged', {}) {}

export class ControlMissing extends Schema.TaggedClass<ControlMissing>()('ControlMissing', {
  control: ControlDescriptor,
}) {}

export class ControlAmbiguous extends Schema.TaggedClass<ControlAmbiguous>()('ControlAmbiguous', {
  control: ControlDescriptor,
}) {}

export class ActionRejected extends Schema.TaggedClass<ActionRejected>()('ActionRejected', { code: FailureCode }) {}

export class ActionNotRun extends Schema.TaggedClass<ActionNotRun>()('ActionNotRun', {}) {}

export class EndRouteChanged extends Schema.TaggedClass<EndRouteChanged>()('EndRouteChanged', {}) {}

export class AnchorMissing extends Schema.TaggedClass<AnchorMissing>()('AnchorMissing', { anchor: Anchor }) {}

export class NoChangeEvidenced extends Schema.TaggedClass<NoChangeEvidenced>()('NoChangeEvidenced', {}) {}

export class UnexpectedAlert
  extends Schema.TaggedClass<UnexpectedAlert>()('UnexpectedAlert', { text: Schema.String })
{}

export const ReplayStopReason = Schema.Union([
  RouteChanged,
  ControlMissing,
  ControlAmbiguous,
  ActionRejected,
  ActionNotRun,
  EndRouteChanged,
  AnchorMissing,
  NoChangeEvidenced,
  UnexpectedAlert,
])
export type ReplayStopReason = typeof ReplayStopReason.Type

export class Miss extends Schema.TaggedClass<Miss>()('Miss', {}) {
  readonly [ReplayDecisionTypeId] = ReplayDecisionTypeId
}

export class Replayed extends Schema.TaggedClass<Replayed>()('Replayed', {
  actions: Schema.Array(Action),
}) {
  readonly [ReplayDecisionTypeId] = ReplayDecisionTypeId
}

export class HandOff extends Schema.TaggedClass<HandOff>()('HandOff', {
  reason: ReplayStopReason,
  prefix: Schema.Array(Action),
}) {
  readonly [ReplayDecisionTypeId] = ReplayDecisionTypeId
}

export const ReplayDecision = Schema.Union([Miss, Replayed, HandOff])
export type ReplayDecision = typeof ReplayDecision.Type

export class ClassifyReplay extends Schema.TaggedClass<ClassifyReplay>()('ClassifyReplay', {
  mode: CacheMode,
  entry: Schema.optionalKey(TraceEntry),
  transcript: ReplayTranscript,
}) {
  static readonly [Workflow.InstrumentationBrand] = { mode: 'app.e2e.cache.replay-mode' } as const
}

interface Stop {
  readonly reason: ReplayStopReason
  readonly prefix: ReadonlyArray<Action>
}

type NodePredicate = (node: SemanticNode, chain: ReadonlyArray<SemanticNode>) => boolean

const actionsOf = (entry: TraceEntry): ReadonlyArray<Action> => Arr.map(entry.actions, (recorded) => recorded.action)

const sameNames = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const nameOf = (node: SemanticNode): ReadonlyArray<string> =>
  Option.match(Option.fromNullishOr(node.name), {
    onNone: () => [],
    onSome: (name) => [name],
  })

const namedAncestorsOf = (chain: ReadonlyArray<SemanticNode>): ReadonlyArray<string> => Arr.flatMap(chain, nameOf)

const nodeMatches = (
  control: ControlDescriptor,
  node: SemanticNode,
  chain: ReadonlyArray<SemanticNode>,
): boolean =>
  Arr.every(
    [node.role === control.role, node.name === control.name, sameNames(namedAncestorsOf(chain), control.context)],
    (holds) => holds,
  )

const countInForest = (
  forest: ReadonlyArray<SemanticNode>,
  chain: ReadonlyArray<SemanticNode>,
  predicate: NodePredicate,
): number => Arr.reduce(forest, 0, (total, node) => total + countInTree(node, chain, predicate))

const countInTree = (node: SemanticNode, chain: ReadonlyArray<SemanticNode>, predicate: NodePredicate): number =>
  Number(predicate(node, chain)) + countInForest(node.children, Arr.append(chain, node), predicate)

const matchCountOf = (control: ControlDescriptor, observation: Observation): number =>
  countInForest(observation.tree, [], (node, chain) => nodeMatches(control, node, chain))

const STATE_KEYS = ['checked', 'selected', 'expanded', 'pressed'] as const

const stateHolds = (recorded: boolean | undefined, actual: boolean | undefined): boolean =>
  Option.match(Option.fromNullishOr(recorded), {
    onNone: () => true,
    onSome: (expected) => expected === actual,
  })

const statesMatch = (anchor: Anchor, node: SemanticNode): boolean =>
  Arr.every(STATE_KEYS, (key) => stateHolds(anchor.states[key], node.states[key]))

const anchorPresentIn = (anchor: Anchor, observation: Observation): boolean =>
  countInForest(
    observation.tree,
    [],
    (node, chain) => Arr.every([nodeMatches(anchor.control, node, chain), statesMatch(anchor, node)], (holds) => holds),
  ) > 0

const BARE_NUMBER = /^\d+$/u

const anchorNameOf = (anchor: Anchor): string => Option.getOrElse(Option.fromNullishOr(anchor.control.name), () => '')

const isCountedAnchor = (anchor: Anchor): boolean => !BARE_NUMBER.test(anchorNameOf(anchor))

const countedAnchorsOf = (anchors: ReadonlyArray<Anchor>): ReadonlyArray<Anchor> => Arr.filter(anchors, isCountedAnchor)

const stop = (reason: ReplayStopReason, prefix: ReadonlyArray<Action>): Stop => ({ reason, prefix })

const stopUnless = (
  reason: ReplayStopReason,
  prefix: ReadonlyArray<Action>,
  passed: boolean,
): Option.Option<Stop> =>
  Option.map(Option.filter(Option.some(reason), () => !passed), (failed) => stop(failed, prefix))

const startRouteStopOf = (entry: TraceEntry, transcript: ReplayTranscript): Option.Option<Stop> =>
  stopUnless(new RouteChanged({}), [], sameRoute(entry.start, transcript.start.route))

const controlStopOf = (
  control: ControlDescriptor,
  observation: Observation,
  prefix: ReadonlyArray<Action>,
): Option.Option<Stop> =>
  Match.value(matchCountOf(control, observation)).pipe(
    Match.when(0, () => Option.some(stop(new ControlMissing({ control }), prefix))),
    Match.when(1, () => Option.none()),
    Match.orElse(() => Option.some(stop(new ControlAmbiguous({ control }), prefix))),
  )

const controlsStopOf = (
  controls: ReadonlyArray<ControlDescriptor>,
  observation: Observation,
  prefix: ReadonlyArray<Action>,
): Option.Option<Stop> =>
  Option.firstSomeOf(Arr.map(controls, (control) => controlStopOf(control, observation, prefix)))

const outcomeStopOf = (step: Option.Option<ReplayStep>, prefix: ReadonlyArray<Action>): Option.Option<Stop> =>
  Option.match(step, {
    onNone: () => Option.some(stop(new ActionNotRun({}), prefix)),
    onSome: (replayStep) =>
      Match.value(replayStep.outcome).pipe(
        Match.tag('Performed', () => Option.none()),
        Match.tag('Rejected', (rejected) => Option.some(stop(new ActionRejected({ code: rejected.code }), prefix))),
        Match.tag('NotRun', () => Option.some(stop(new ActionNotRun({}), prefix))),
        Match.exhaustive,
      ),
  })

const actionStopAt = (entry: TraceEntry, transcript: ReplayTranscript, index: number): Option.Option<Stop> =>
  Option.flatMap(Arr.get(entry.actions, index), (recorded) => {
    const prefix = Arr.take(actionsOf(entry), index)
    return Option.firstSomeOf([
      Option.flatMap(
        Arr.get(transcript.steps, index),
        (step) => controlsStopOf(recorded.controls, step.observation, prefix),
      ),
      outcomeStopOf(Arr.get(transcript.steps, index), prefix),
    ])
  })

const actionsStopOf = (entry: TraceEntry, transcript: ReplayTranscript): Option.Option<Stop> =>
  Option.firstSomeOf(Arr.makeBy(entry.actions.length, (index) => actionStopAt(entry, transcript, index)))

const endRouteStopOf = (
  entry: TraceEntry,
  transcript: ReplayTranscript,
  prefix: ReadonlyArray<Action>,
): Option.Option<Stop> => stopUnless(new EndRouteChanged({}), prefix, sameRoute(entry.end, transcript.end.route))

const firstAnchorStopOf = (
  anchors: ReadonlyArray<Anchor>,
  present: (anchor: Anchor) => boolean,
  prefix: ReadonlyArray<Action>,
): Option.Option<Stop> =>
  Option.map(
    Arr.findFirst(anchors, (anchor) => !present(anchor)),
    (missing) => stop(new AnchorMissing({ anchor: missing }), prefix),
  )

const routeMovedOf = (transcript: ReplayTranscript): boolean => !sameRoute(transcript.start.route, transcript.end.route)

const changeEvidenced = (entry: TraceEntry, transcript: ReplayTranscript): boolean =>
  Arr.some(
    [
      routeMovedOf(transcript),
      ...Arr.map(countedAnchorsOf(entry.anchors.appeared), (anchor) => !anchorPresentIn(anchor, transcript.start)),
      ...Arr.map(countedAnchorsOf(entry.anchors.gone), (anchor) => anchorPresentIn(anchor, transcript.start)),
    ],
    (evidenced) => evidenced,
  )

const endStopOf = (
  entry: TraceEntry,
  transcript: ReplayTranscript,
  prefix: ReadonlyArray<Action>,
): Option.Option<Stop> =>
  Option.firstSomeOf([
    endRouteStopOf(entry, transcript, prefix),
    firstAnchorStopOf(
      countedAnchorsOf(entry.anchors.appeared),
      (anchor) => anchorPresentIn(anchor, transcript.end),
      prefix,
    ),
    firstAnchorStopOf(
      countedAnchorsOf(entry.anchors.gone),
      (anchor) => !anchorPresentIn(anchor, transcript.end),
      prefix,
    ),
    stopUnless(new NoChangeEvidenced({}), prefix, changeEvidenced(entry, transcript)),
  ])

const alertStopOf = (
  entry: TraceEntry,
  transcript: ReplayTranscript,
  prefix: ReadonlyArray<Action>,
): Option.Option<Stop> =>
  Option.map(
    Arr.findFirst(transcript.alerts, (text) => !Arr.contains(entry.alerts, text)),
    (text) => stop(new UnexpectedAlert({ text }), prefix),
  )

const stopOf = (entry: TraceEntry, transcript: ReplayTranscript): Option.Option<Stop> =>
  Option.firstSomeOf([
    startRouteStopOf(entry, transcript),
    actionsStopOf(entry, transcript),
    endStopOf(entry, transcript, actionsOf(entry)),
    alertStopOf(entry, transcript, actionsOf(entry)),
  ])

const decisionOf = (entry: TraceEntry, transcript: ReplayTranscript): ReplayDecision =>
  Option.match(stopOf(entry, transcript), {
    onNone: () => new Replayed({ actions: actionsOf(entry) }),
    onSome: (handOff) => new HandOff({ reason: handOff.reason, prefix: handOff.prefix }),
  })

const gatedEntryOf = (command: ClassifyReplay): Option.Option<TraceEntry> =>
  Option.filter(Option.fromNullishOr(command.entry), () => command.mode !== 'off')

const decide = (command: ClassifyReplay): Result.Result<ReplayDecision, never> =>
  Result.succeed(
    Option.match(gatedEntryOf(command), {
      onNone: () => new Miss({}),
      onSome: (entry) => decisionOf(entry, command.transcript),
    }),
  )

export const classifyReplay = Workflow.make({
  command: ClassifyReplay,
  decision: ReplayDecision,
  error: Schema.Never,
  decide,
})
