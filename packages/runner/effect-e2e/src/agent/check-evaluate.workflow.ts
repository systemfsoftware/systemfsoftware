import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { type CanonicalJson, canonicalJsonOf } from '../cache/key.schema.js'
import { Locator } from '../engine/locator.schema.js'
import { type NormalizedRoute, normalizeRoute, Route, sameRoute } from '../engine/route.schema.js'
import { NodeRef, SemanticNode } from '../engine/semantic-node.schema.js'
import type {
  EvidenceRef,
  PresentCheck,
  RouteCheck,
  StateCheck,
  TextCheck,
  TextMatch,
  ValueCheck,
} from '../verdict/check.schema.js'
import { Check } from '../verdict/check.schema.js'
import { Evidence } from '../verdict/failure.schema.js'

const CheckEvaluateDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/CheckEvaluateDecision')
type CheckEvaluateDecisionTypeId = typeof CheckEvaluateDecisionTypeId

export const LocatorMatches = Schema.Union([
  Schema.TaggedStruct('Queried', { locator: Locator, nodes: Schema.Array(SemanticNode) }),
  Schema.TaggedStruct('Unqueryable', { locator: Locator }),
])
export type LocatorMatches = typeof LocatorMatches.Type

export const UnevaluableReason = Schema.Literals([
  'missing',
  'ambiguous',
  'route-changed',
  'no-state',
  'unqueryable',
  'unsupported',
  'vacuous',
])
export type UnevaluableReason = typeof UnevaluableReason.Type

export class Holds extends Schema.TaggedClass<Holds>()('Holds', { evidence: Evidence }) {
  readonly [CheckEvaluateDecisionTypeId] = CheckEvaluateDecisionTypeId
}

export class DoesNotHold extends Schema.TaggedClass<DoesNotHold>()('DoesNotHold', { evidence: Evidence }) {
  readonly [CheckEvaluateDecisionTypeId] = CheckEvaluateDecisionTypeId
}

export class Unevaluable extends Schema.TaggedClass<Unevaluable>()('Unevaluable', {
  reason: UnevaluableReason,
  evidence: Evidence,
}) {
  readonly [CheckEvaluateDecisionTypeId] = CheckEvaluateDecisionTypeId
}

export const CheckEvaluateDecision = Schema.Union([Holds, DoesNotHold, Unevaluable])
export type CheckEvaluateDecision = typeof CheckEvaluateDecision.Type

export class CheckEvaluate extends Schema.TaggedClass<CheckEvaluate>()('CheckEvaluate', {
  check: Check,
  route: Route,
  resolvedOn: Route,
  located: Schema.Array(LocatorMatches),
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

type LocatorLeafCheck = PresentCheck | TextCheck | ValueCheck | StateCheck

interface EvaluatedScreen {
  readonly located: ReadonlyArray<LocatorMatches>
  readonly route: Route
  readonly resolvedOn: Route
}

const locatorEquivalence = Schema.toEquivalence(Locator)

const sameLocator = (left: Locator, right: Locator): boolean => locatorEquivalence(left, right)

const locatedOf = (located: ReadonlyArray<LocatorMatches>, locator: Locator): Option.Option<LocatorMatches> =>
  Arr.findFirst(located, (entry) => sameLocator(entry.locator, locator))

const visibleOf = (nodes: ReadonlyArray<SemanticNode>): ReadonlyArray<SemanticNode> =>
  Arr.filter(nodes, (node) => !node.states.hidden)

const collapsedOf = (text: string): string => text.replace(/\s+/gu, ' ').trim()

const textOf = (node: SemanticNode): string =>
  Option.match(Option.fromUndefinedOr(node.text), {
    onNone: () => Option.getOrElse(Option.fromUndefinedOr(node.name), () => ''),
    onSome: (text) => text,
  })

const valueOf = (node: SemanticNode): string => Option.getOrElse(Option.fromUndefinedOr(node.value), () => '')

const matchedBy = (match: TextMatch, actual: string): boolean =>
  Match.value(match.kind).pipe(
    Match.when('exact', () => actual === match.value),
    Match.when('contains', () => actual.includes(match.value)),
    Match.exhaustive,
  )

const evidenceOf = (route: Route, nodes: ReadonlyArray<SemanticNode>): Evidence => [
  { _tag: 'RouteEvidence', route },
  ...Arr.map(nodes, (node): EvidenceRef => ({ _tag: 'NodeEvidence', ref: node.ref })),
]

const holdsOf = (evidence: Evidence): CheckEvaluateDecision => new Holds({ evidence })

const doesNotHoldOf = (evidence: Evidence): CheckEvaluateDecision => new DoesNotHold({ evidence })

const unevaluableOf = (
  route: Route,
  reason: UnevaluableReason,
  nodes: ReadonlyArray<SemanticNode>,
): CheckEvaluateDecision => new Unevaluable({ reason, evidence: evidenceOf(route, nodes) })

const routeOnlyOf = (route: Route, reason: UnevaluableReason): CheckEvaluateDecision => unevaluableOf(route, reason, [])

const queriedOf = (
  screen: EvaluatedScreen,
  locator: Locator,
  decided: (visible: ReadonlyArray<SemanticNode>) => CheckEvaluateDecision,
): CheckEvaluateDecision =>
  Option.match(locatedOf(screen.located, locator), {
    onNone: () => routeOnlyOf(screen.route, 'unqueryable'),
    onSome: (entry) =>
      Match.valueTags(entry, {
        Queried: ({ nodes }) => decided(visibleOf(nodes)),
        Unqueryable: () => routeOnlyOf(screen.route, 'unqueryable'),
      }),
  })

const presentOf = (screen: EvaluatedScreen, check: PresentCheck, polarity: boolean): CheckEvaluateDecision =>
  queriedOf(screen, check.locator, (visible) =>
    Arr.match(visible, {
      onEmpty: () =>
        Match.value(polarity).pipe(
          Match.when(true, () => routeOnlyOf(screen.route, 'missing')),
          Match.when(false, () => doesNotHoldOf(evidenceOf(screen.route, []))),
          Match.exhaustive,
        ),
      onNonEmpty: (nodes) => holdsOf(evidenceOf(screen.route, nodes)),
    }))

const comparedOf = (
  screen: EvaluatedScreen,
  match: TextMatch,
  actual: string,
  node: SemanticNode,
): CheckEvaluateDecision =>
  Match.value(matchedBy(match, actual)).pipe(
    Match.when(true, () => holdsOf(evidenceOf(screen.route, [node]))),
    Match.when(false, () => doesNotHoldOf(evidenceOf(screen.route, [node]))),
    Match.exhaustive,
  )

const textLeafOf = (screen: EvaluatedScreen, check: TextCheck) => (node: SemanticNode): CheckEvaluateDecision =>
  comparedOf(screen, check.match, collapsedOf(textOf(node)), node)

const valueLeafOf = (screen: EvaluatedScreen, check: ValueCheck) => (node: SemanticNode): CheckEvaluateDecision =>
  comparedOf(screen, check.match, collapsedOf(valueOf(node)), node)

const stateLeafOf = (screen: EvaluatedScreen, check: StateCheck) => (node: SemanticNode): CheckEvaluateDecision =>
  Option.match(Option.fromUndefinedOr(node.states[check.state]), {
    onNone: () => unevaluableOf(screen.route, 'no-state', [node]),
    onSome: (actual) =>
      Match.value(actual === check.expected).pipe(
        Match.when(true, () => holdsOf(evidenceOf(screen.route, [node]))),
        Match.when(false, () => doesNotHoldOf(evidenceOf(screen.route, [node]))),
        Match.exhaustive,
      ),
  })

const singleOf = (
  screen: EvaluatedScreen,
  locator: Locator,
  decided: (node: SemanticNode) => CheckEvaluateDecision,
): CheckEvaluateDecision =>
  queriedOf(screen, locator, (visible) =>
    Arr.match(visible, {
      onEmpty: () => routeOnlyOf(screen.route, 'missing'),
      onNonEmpty: (nodes) =>
        Match.value(nodes.length > 1).pipe(
          Match.when(true, () => new Unevaluable({ reason: 'ambiguous', evidence: evidenceOf(screen.route, nodes) })),
          Match.when(false, () => decided(Arr.headNonEmpty(nodes))),
          Match.exhaustive,
        ),
    }))

const queriedLeafOf = (screen: EvaluatedScreen, check: LocatorLeafCheck, polarity: boolean): CheckEvaluateDecision =>
  Match.value(check).pipe(
    Match.tag('Present', (present) => presentOf(screen, present, polarity)),
    Match.tag('Text', (text) => singleOf(screen, text.locator, textLeafOf(screen, text))),
    Match.tag('Value', (value) => singleOf(screen, value.locator, valueLeafOf(screen, value))),
    Match.tag('State', (state) => singleOf(screen, state.locator, stateLeafOf(screen, state))),
    Match.exhaustive,
  )

const locatorLeafOf = (screen: EvaluatedScreen, check: LocatorLeafCheck, polarity: boolean): CheckEvaluateDecision =>
  Match.value(sameRoute(screen.resolvedOn, screen.route)).pipe(
    Match.when(false, () => routeOnlyOf(screen.route, 'route-changed')),
    Match.when(true, () => queriedLeafOf(screen, check, polarity)),
    Match.exhaustive,
  )

const canonicalRouteOf = (route: NormalizedRoute): CanonicalJson => canonicalJsonOf(route)

const routeLeafOf = (screen: EvaluatedScreen, check: RouteCheck): CheckEvaluateDecision =>
  Match.value(canonicalRouteOf(normalizeRoute(screen.route)) === canonicalRouteOf(check.route)).pipe(
    Match.when(true, () => holdsOf(evidenceOf(screen.route, []))),
    Match.when(false, () => doesNotHoldOf(evidenceOf(screen.route, []))),
    Match.exhaustive,
  )

const isDoesNotHold = (decision: CheckEvaluateDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('DoesNotHold', () => true),
    Match.orElse(() => false),
  )

const isHolds = (decision: CheckEvaluateDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('Holds', () => true),
    Match.orElse(() => false),
  )

const unevaluableOptionOf = (decision: CheckEvaluateDecision): Option.Option<Unevaluable> =>
  Match.value(decision).pipe(
    Match.tag('Unevaluable', (unevaluable: Unevaluable) => Option.some(unevaluable)),
    Match.orElse(() => Option.none<Unevaluable>()),
  )

const firstUnevaluableOf = (decisions: ReadonlyArray<CheckEvaluateDecision>): Option.Option<Unevaluable> =>
  Arr.findFirst(decisions, unevaluableOptionOf)

const nodeRefsOf = (decision: CheckEvaluateDecision): ReadonlyArray<NodeRef> =>
  Arr.flatMap(decision.evidence, (ref) =>
    Match.valueTags(ref, {
      NodeEvidence: ({ ref }): ReadonlyArray<NodeRef> => [ref],
      ScreenshotEvidence: (): ReadonlyArray<NodeRef> => [],
      RouteEvidence: (): ReadonlyArray<NodeRef> => [],
      LogEvidence: (): ReadonlyArray<NodeRef> => [],
    }))

const dedupedRefsOf = (refs: ReadonlyArray<NodeRef>): ReadonlyArray<NodeRef> =>
  Arr.dedupeWith(refs, (left: NodeRef, right: NodeRef) => left.id === right.id)

const compositeEvidenceOf = (screen: EvaluatedScreen, decisions: ReadonlyArray<CheckEvaluateDecision>): Evidence => [
  { _tag: 'RouteEvidence', route: screen.route },
  ...Arr.map(
    dedupedRefsOf(Arr.flatMap(decisions, nodeRefsOf)),
    (ref): EvidenceRef => ({ _tag: 'NodeEvidence', ref }),
  ),
]

const allDecisionOf = (
  screen: EvaluatedScreen,
  decisions: ReadonlyArray<CheckEvaluateDecision>,
): CheckEvaluateDecision =>
  Match.value(Arr.some(decisions, isDoesNotHold)).pipe(
    Match.when(true, () => doesNotHoldOf(compositeEvidenceOf(screen, decisions))),
    Match.when(false, () =>
      Option.match(firstUnevaluableOf(decisions), {
        onNone: () => holdsOf(compositeEvidenceOf(screen, decisions)),
        onSome: (unevaluable) =>
          new Unevaluable({ reason: unevaluable.reason, evidence: compositeEvidenceOf(screen, decisions) }),
      })),
    Match.exhaustive,
  )

const anyDecisionOf = (
  screen: EvaluatedScreen,
  decisions: ReadonlyArray<CheckEvaluateDecision>,
): CheckEvaluateDecision =>
  Match.value(Arr.some(decisions, isHolds)).pipe(
    Match.when(true, () => holdsOf(compositeEvidenceOf(screen, decisions))),
    Match.when(false, () =>
      Option.match(firstUnevaluableOf(decisions), {
        onNone: () => doesNotHoldOf(compositeEvidenceOf(screen, decisions)),
        onSome: (unevaluable) =>
          new Unevaluable({ reason: unevaluable.reason, evidence: compositeEvidenceOf(screen, decisions) }),
      })),
    Match.exhaustive,
  )

const allOfOf = (screen: EvaluatedScreen, checks: ReadonlyArray<Check>, polarity: boolean): CheckEvaluateDecision =>
  Arr.match(checks, {
    onEmpty: () => routeOnlyOf(screen.route, 'vacuous'),
    onNonEmpty: (children) => allDecisionOf(screen, Arr.map(children, (child) => evalCheck(screen, child, polarity))),
  })

const anyOfOf = (screen: EvaluatedScreen, checks: ReadonlyArray<Check>, polarity: boolean): CheckEvaluateDecision =>
  Arr.match(checks, {
    onEmpty: () => routeOnlyOf(screen.route, 'vacuous'),
    onNonEmpty: (children) => anyDecisionOf(screen, Arr.map(children, (child) => evalCheck(screen, child, polarity))),
  })

const negatedOf = (decision: CheckEvaluateDecision): CheckEvaluateDecision =>
  Match.value(decision).pipe(
    Match.tag('Holds', ({ evidence }) => new DoesNotHold({ evidence })),
    Match.tag('DoesNotHold', ({ evidence }) => new Holds({ evidence })),
    Match.tag('Unevaluable', (unevaluable) => unevaluable),
    Match.exhaustive,
  )

const evalCheck = (screen: EvaluatedScreen, check: Check, polarity: boolean): CheckEvaluateDecision =>
  Match.value(check).pipe(
    Match.tag('Present', (present) => locatorLeafOf(screen, present, polarity)),
    Match.tag('Text', (text) => locatorLeafOf(screen, text, polarity)),
    Match.tag('Value', (value) => locatorLeafOf(screen, value, polarity)),
    Match.tag('State', (state) => locatorLeafOf(screen, state, polarity)),
    Match.tag('Route', (route) => routeLeafOf(screen, route)),
    Match.tag('Region', () => routeOnlyOf(screen.route, 'unsupported')),
    Match.tag('Not', (not) => negatedOf(evalCheck(screen, not.check, !polarity))),
    Match.tag('AllOf', ({ checks }) => allOfOf(screen, checks, polarity)),
    Match.tag('AnyOf', ({ checks }) => anyOfOf(screen, checks, polarity)),
    Match.exhaustive,
  )

const decide = (command: CheckEvaluate): Result.Result<CheckEvaluateDecision, never> =>
  Result.succeed(
    evalCheck(
      { located: command.located, route: command.route, resolvedOn: command.resolvedOn },
      command.check,
      true,
    ),
  )

export const checkEvaluate = Workflow.make({
  command: CheckEvaluate,
  decision: CheckEvaluateDecision,
  error: Schema.Never,
  decide,
})
