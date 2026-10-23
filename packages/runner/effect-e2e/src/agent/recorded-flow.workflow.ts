import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import {
  Anchor,
  Anchors,
  AnchorStates,
  ControlDescriptor,
  Provenance,
  RecordedAction,
  TraceEntry,
} from '../cache/entry.schema.js'
import { CacheKeyContext } from '../cache/key.schema.js'
import { Observation } from '../engine/observation.schema.js'
import { SemanticNode } from '../engine/semantic-node.schema.js'

const RecordedFlowDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/RecordedFlowDecision')

export class RecordFlow extends Schema.TaggedClass<RecordFlow>()('RecordFlow', {
  keyedBy: CacheKeyContext,
  start: Observation,
  end: Observation,
  actions: Schema.Array(RecordedAction),
  provenance: Provenance,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

export class Recorded extends Schema.TaggedClass<Recorded>()('Recorded', { entry: TraceEntry }) {
  readonly [RecordedFlowDecisionTypeId] = RecordedFlowDecisionTypeId
}

export class NotRecordable extends Schema.TaggedClass<NotRecordable>()('NotRecordable', {
  reason: Schema.Literals(['no-actions', 'too-many-actions', 'no-change-evidenced']),
}) {
  readonly [RecordedFlowDecisionTypeId] = RecordedFlowDecisionTypeId
}

export const RecordedFlowDecision = Schema.Union([Recorded, NotRecordable])
export type RecordedFlowDecision = typeof RecordedFlowDecision.Type

// The trace-1 wire caps (mirrored from entry.schema, which enforces them on decode).
const MAX_ACTIONS = 50
const MAX_ANCHORS = 8

const STATE_KEYS = ['checked', 'selected', 'expanded', 'pressed'] as const

const BARE_NUMBER = /^\d+$/u

interface NodeOccurrence {
  readonly node: SemanticNode
  readonly context: ReadonlyArray<string>
}

interface IdentifiedOccurrence {
  readonly node: SemanticNode
  readonly identity: ControlDescriptor
}

// --- node identity: a node is its control descriptor — role, name, and the names of its named
// ancestors root-first — exactly the identity classifyReplay re-finds a recording by.

const nameOf = (node: SemanticNode): ReadonlyArray<string> =>
  Option.match(Option.fromNullishOr(node.name), {
    onNone: () => [],
    onSome: (name) => [name],
  })

const occurrencesOf = (forest: ReadonlyArray<SemanticNode>): ReadonlyArray<NodeOccurrence> =>
  occurrencesOfChained(forest, [])

const occurrencesOfChained = (
  forest: ReadonlyArray<SemanticNode>,
  context: ReadonlyArray<string>,
): ReadonlyArray<NodeOccurrence> => Arr.flatMap(forest, (node) => occurrencesIn(node, context))

const occurrencesIn = (node: SemanticNode, context: ReadonlyArray<string>): ReadonlyArray<NodeOccurrence> =>
  Match.value(node.states.hidden).pipe(
    Match.when(true, (): ReadonlyArray<NodeOccurrence> => []),
    Match.when(false, () => [
      { node, context },
      ...occurrencesOfChained(node.children, [...context, ...nameOf(node)]),
    ]),
    Match.exhaustive,
  )

const hasIdentity = (node: SemanticNode): boolean => Arr.some([node.role, node.name], (field) => field !== undefined)

const roleFieldOf = (role: string | undefined): { readonly role?: string } =>
  Option.match(Option.fromNullishOr(role), {
    onNone: () => ({}),
    onSome: (value) => ({ role: value }),
  })

const nameFieldOf = (name: string | undefined): { readonly name?: string } =>
  Option.match(Option.fromNullishOr(name), {
    onNone: () => ({}),
    onSome: (value) => ({ name: value }),
  })

const identityOf = (occurrence: NodeOccurrence): ControlDescriptor => ({
  ...roleFieldOf(occurrence.node.role),
  ...nameFieldOf(occurrence.node.name),
  context: occurrence.context,
})

const identifiedOf = (occurrence: NodeOccurrence): Option.Option<IdentifiedOccurrence> =>
  Option.map(
    Option.filter(Option.some(occurrence), (present) => hasIdentity(present.node)),
    (present): IdentifiedOccurrence => ({ node: present.node, identity: identityOf(present) }),
  )

const identifiedOccurrencesOf = (forest: ReadonlyArray<SemanticNode>): ReadonlyArray<IdentifiedOccurrence> =>
  Arr.getSomes(Arr.map(occurrencesOf(forest), identifiedOf))

// --- states: the four anchorable states, matched the way classifyReplay matches anchor states.

const stateHolds = (recorded: boolean | undefined, actual: boolean | undefined): boolean =>
  Option.match(Option.fromNullishOr(recorded), {
    onNone: () => true,
    onSome: (expected) => expected === actual,
  })

const statesMatch = (recorded: SemanticNode, actual: SemanticNode): boolean =>
  Arr.every(STATE_KEYS, (key) => stateHolds(recorded.states[key], actual.states[key]))

const checkedFieldOf = (node: SemanticNode): { readonly checked?: boolean } =>
  Option.match(Option.fromNullishOr(node.states.checked), {
    onNone: () => ({}),
    onSome: (checked) => ({ checked }),
  })

const selectedFieldOf = (node: SemanticNode): { readonly selected?: boolean } =>
  Option.match(Option.fromNullishOr(node.states.selected), {
    onNone: () => ({}),
    onSome: (selected) => ({ selected }),
  })

const expandedFieldOf = (node: SemanticNode): { readonly expanded?: boolean } =>
  Option.match(Option.fromNullishOr(node.states.expanded), {
    onNone: () => ({}),
    onSome: (expanded) => ({ expanded }),
  })

const pressedFieldOf = (node: SemanticNode): { readonly pressed?: boolean } =>
  Option.match(Option.fromNullishOr(node.states.pressed), {
    onNone: () => ({}),
    onSome: (pressed) => ({ pressed }),
  })

const anchorStatesOf = (node: SemanticNode): AnchorStates => ({
  ...checkedFieldOf(node),
  ...selectedFieldOf(node),
  ...expandedFieldOf(node),
  ...pressedFieldOf(node),
})

// --- anchors.

const anchorOf = (occurrence: IdentifiedOccurrence, states: AnchorStates): Anchor => ({
  control: occurrence.identity,
  states,
})

const sameIdentity = (left: ControlDescriptor, right: ControlDescriptor): boolean =>
  JSON.stringify(left) === JSON.stringify(right)

const identityAbsentFrom = (
  identity: ControlDescriptor,
  others: ReadonlyArray<IdentifiedOccurrence>,
): boolean => !Arr.some(others, (other) => sameIdentity(other.identity, identity))

const differsFromEvery = (
  occurrence: IdentifiedOccurrence,
  starts: ReadonlyArray<IdentifiedOccurrence>,
): boolean =>
  Arr.every(
    Arr.filter(starts, (start) => sameIdentity(start.identity, occurrence.identity)),
    (start) => !statesMatch(occurrence.node, start.node),
  )

const changedAnchorOf = (
  occurrence: IdentifiedOccurrence,
  starts: ReadonlyArray<IdentifiedOccurrence>,
): Option.Option<Anchor> =>
  Option.filter(
    Option.some(anchorOf(occurrence, anchorStatesOf(occurrence.node))),
    () => differsFromEvery(occurrence, starts),
  )

const appearedAnchorOf = (
  occurrence: IdentifiedOccurrence,
  starts: ReadonlyArray<IdentifiedOccurrence>,
): Option.Option<Anchor> =>
  Match.value(identityAbsentFrom(occurrence.identity, starts)).pipe(
    Match.when(true, () => Option.some(anchorOf(occurrence, {}))),
    Match.when(false, () => changedAnchorOf(occurrence, starts)),
    Match.exhaustive,
  )

const goneAnchorOf = (
  occurrence: IdentifiedOccurrence,
  ends: ReadonlyArray<IdentifiedOccurrence>,
): Option.Option<Anchor> =>
  Option.filter(Option.some(anchorOf(occurrence, {})), () => identityAbsentFrom(occurrence.identity, ends))

const anchorNameOf = (anchor: Anchor): string => Option.getOrElse(Option.fromNullishOr(anchor.control.name), () => '')

const isCountedAnchor = (anchor: Anchor): boolean => !BARE_NUMBER.test(anchorNameOf(anchor))

const sameAnchor = (left: Anchor, right: Anchor): boolean => JSON.stringify(left) === JSON.stringify(right)

const cappedAnchorsOf = (anchors: ReadonlyArray<Anchor>): ReadonlyArray<Anchor> =>
  Arr.take(Arr.dedupeWith(Arr.filter(anchors, isCountedAnchor), sameAnchor), MAX_ANCHORS)

const anchorsBetween = (
  starts: ReadonlyArray<IdentifiedOccurrence>,
  ends: ReadonlyArray<IdentifiedOccurrence>,
): Anchors => ({
  appeared: cappedAnchorsOf(Arr.getSomes(Arr.map(ends, (end) => appearedAnchorOf(end, starts)))),
  gone: cappedAnchorsOf(Arr.getSomes(Arr.map(starts, (start) => goneAnchorOf(start, ends)))),
})

const anchorsOf = (start: Observation, end: Observation): Anchors =>
  anchorsBetween(identifiedOccurrencesOf(start.tree), identifiedOccurrencesOf(end.tree))

// --- decision.

const changeEvidenced = (anchors: Anchors): boolean =>
  Arr.some([anchors.appeared.length, anchors.gone.length], (count) => count > 0)

const entryOf = (command: RecordFlow, anchors: Anchors): TraceEntry => ({
  schema: 'trace-1',
  keyedBy: command.keyedBy,
  start: command.start.route,
  actions: command.actions,
  end: command.end.route,
  anchors,
  checks: [],
  alerts: [],
  provenance: command.provenance,
})

const recordedOrNoChangeOf = (command: RecordFlow): RecordedFlowDecision => {
  const anchors = anchorsOf(command.start, command.end)
  return Match.value(changeEvidenced(anchors)).pipe(
    Match.when(true, () => new Recorded({ entry: entryOf(command, anchors) })),
    Match.when(false, () => new NotRecordable({ reason: 'no-change-evidenced' })),
    Match.exhaustive,
  )
}

const decisionWithActionsOf = (command: RecordFlow): RecordedFlowDecision =>
  Match.value(command.actions.length > MAX_ACTIONS).pipe(
    Match.when(true, () => new NotRecordable({ reason: 'too-many-actions' })),
    Match.when(false, () => recordedOrNoChangeOf(command)),
    Match.exhaustive,
  )

const decisionOf = (command: RecordFlow): RecordedFlowDecision =>
  Match.value(command.actions.length === 0).pipe(
    Match.when(true, () => new NotRecordable({ reason: 'no-actions' })),
    Match.when(false, () => decisionWithActionsOf(command)),
    Match.exhaustive,
  )

export const recordedFlow = Workflow.make({
  command: RecordFlow,
  decision: RecordedFlowDecision,
  error: Schema.Never,
  decide: (command): Result.Result<RecordedFlowDecision, never> => Result.succeed(decisionOf(command)),
})
