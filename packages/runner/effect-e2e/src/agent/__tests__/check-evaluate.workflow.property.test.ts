import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { canonicalJsonOf } from '../../cache/key.schema.js'
import { Locator } from '../../engine/locator.schema.js'
import { NormalizedRoute, normalizeRoute, Route } from '../../engine/route.schema.js'
import type { SemanticNode } from '../../engine/semantic-node.schema.js'
import { Check, checkLocatorsOf, type TextMatch } from '../../verdict/check.schema.js'
import {
  CheckEvaluate,
  checkEvaluate,
  type CheckEvaluateDecision,
  type LocatorMatches,
  type UnevaluableReason,
} from '../check-evaluate.workflow.js'

interface NodeFields {
  readonly id: string
  readonly role?: string | undefined
  readonly name?: string | undefined
  readonly text?: string | undefined
  readonly value?: string | undefined
  readonly hidden: boolean
  readonly disabled: boolean
  readonly checked?: boolean | undefined
}

const nodeOf = (fields: NodeFields): SemanticNode => ({
  ref: { id: fields.id, revision: 'rev' },
  states: {
    disabled: fields.disabled,
    hidden: fields.hidden,
    ...(fields.checked === undefined ? {} : { checked: fields.checked }),
  },
  ...(fields.role === undefined ? {} : { role: fields.role }),
  ...(fields.name === undefined ? {} : { name: fields.name }),
  ...(fields.text === undefined ? {} : { text: fields.text }),
  ...(fields.value === undefined ? {} : { value: fields.value }),
  children: [],
})

const queriedOf = (locator: Locator, nodes: ReadonlyArray<SemanticNode>): LocatorMatches => ({
  _tag: 'Queried',
  locator,
  nodes,
})

const unqueriedOf = (locator: Locator): LocatorMatches => ({ _tag: 'Unqueryable', locator })

const decisionOf = (subject: typeof checkEvaluate, command: CheckEvaluate): CheckEvaluateDecision =>
  Result.match(subject(command), { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const isTag = (decision: CheckEvaluateDecision, tag: CheckEvaluateDecision['_tag']): boolean =>
  Match.valueTags(decision, {
    Holds: () => tag === 'Holds',
    DoesNotHold: () => tag === 'DoesNotHold',
    Unevaluable: () => tag === 'Unevaluable',
  })

const sameTag = (left: CheckEvaluateDecision, right: CheckEvaluateDecision): boolean =>
  Match.value(left).pipe(
    Match.tag('Holds', () => isTag(right, 'Holds')),
    Match.tag('DoesNotHold', () => isTag(right, 'DoesNotHold')),
    Match.tag('Unevaluable', () => isTag(right, 'Unevaluable')),
    Match.exhaustive,
  )

const isUnevaluable = (decision: CheckEvaluateDecision, reason: UnevaluableReason): boolean =>
  Match.value(decision).pipe(
    Match.tag('Unevaluable', (unevaluable) => unevaluable.reason === reason),
    Match.orElse(() => false),
  )

it.prop(
  '∀s_CheckEvaluate_≡DoubleNegationPreservesDecisionTag',
  {
    of: [Check, Route, Route, Schema.String, Schema.String, Schema.Boolean, Schema.Boolean],
    subject: checkEvaluate,
    arbitrary: { seed: 506_201 },
  },
  (subject, [check, route, resolvedOn, id, name, hidden, disabled]) => {
    const node = nodeOf({ id, name, hidden, disabled })
    const located = Arr.map(checkLocatorsOf(check), (locator) => queriedOf(locator, [node]))
    const once = decisionOf(subject, new CheckEvaluate({ check, route, resolvedOn, located }))
    const twice = decisionOf(
      subject,
      new CheckEvaluate({
        check: { _tag: 'Not', check: { _tag: 'Not', check } },
        route,
        resolvedOn,
        located,
      }),
    )
    return sameTag(once, twice)
  },
)

it.prop(
  '∀s_CheckEvaluate_≡DeMorganBothWays',
  {
    of: [Schema.Array(Check), Route, Route, Schema.String, Schema.Boolean],
    subject: checkEvaluate,
    arbitrary: { seed: 506_202 },
  },
  (subject, [children, route, resolvedOn, id, hidden]) => {
    const node = nodeOf({ id, hidden, disabled: false })
    const located = Arr.flatMap(
      children,
      (child) => Arr.map(checkLocatorsOf(child), (locator) => queriedOf(locator, [node])),
    )
    const decide = (check: Check): CheckEvaluateDecision =>
      decisionOf(subject, new CheckEvaluate({ check, route, resolvedOn, located }))
    const notAll = decide({ _tag: 'Not', check: { _tag: 'AllOf', checks: children } })
    const anyNot = decide({
      _tag: 'AnyOf',
      checks: Arr.map(children, (child): Check => ({ _tag: 'Not', check: child })),
    })
    const notAny = decide({ _tag: 'Not', check: { _tag: 'AnyOf', checks: children } })
    const allNot = decide({
      _tag: 'AllOf',
      checks: Arr.map(children, (child): Check => ({ _tag: 'Not', check: child })),
    })
    return sameTag(notAll, anyNot) && sameTag(notAny, allNot)
  },
)

it.prop(
  '∀s_CheckEvaluate_≡ZeroVisibleMatchesAreAbsent',
  {
    of: [Locator, Route, Schema.String, Schema.String, Schema.Boolean],
    subject: checkEvaluate,
    arbitrary: { seed: 506_203 },
  },
  (subject, [locator, route, id, name, disabled]) => {
    const hiddenNode = nodeOf({ id, name, hidden: true, disabled })
    const decide = (check: Check, located: ReadonlyArray<LocatorMatches>): CheckEvaluateDecision =>
      decisionOf(subject, new CheckEvaluate({ check, route, resolvedOn: route, located }))
    const presentHidden = decide({ _tag: 'Present', locator }, [queriedOf(locator, [hiddenNode])])
    const notPresentHidden = decide({ _tag: 'Not', check: { _tag: 'Present', locator } }, [
      queriedOf(locator, [hiddenNode]),
    ])
    const textHidden = decide(
      { _tag: 'Text', locator, match: { kind: 'contains', value: name } },
      [queriedOf(locator, [hiddenNode])],
    )
    const notTextHidden = decide(
      { _tag: 'Not', check: { _tag: 'Text', locator, match: { kind: 'contains', value: name } } },
      [queriedOf(locator, [hiddenNode])],
    )
    const presentEmpty = decide({ _tag: 'Present', locator }, [queriedOf(locator, [])])
    return isUnevaluable(presentHidden, 'missing') &&
      isTag(notPresentHidden, 'Holds') &&
      isUnevaluable(textHidden, 'missing') &&
      isUnevaluable(notTextHidden, 'missing') &&
      isUnevaluable(presentEmpty, 'missing')
  },
)

it.prop(
  '∀s_CheckEvaluate_≡TextComparesTheCollapsedValue',
  {
    of: [Locator, Route, Schema.String, Schema.Int, Schema.Int, Schema.String],
    subject: checkEvaluate,
    arbitrary: { seed: 506_204 },
  },
  (subject, [locator, route, text, first, second, extra]) => {
    const node = nodeOf({ id: `${extra}${String(first)}`, text, hidden: false, disabled: false })
    const collapsed = text.replace(/\s+/gu, ' ').trim()
    const start = Math.abs(first) % (collapsed.length + 1)
    const stop = start + Math.abs(second) % (collapsed.length - start + 1)
    const needle = collapsed.slice(start, stop)
    const other = `${collapsed}${extra}${String(first)}`
    const located = [queriedOf(locator, [node])]
    const decideText = (match: TextMatch): CheckEvaluateDecision =>
      decisionOf(
        subject,
        new CheckEvaluate({ check: { _tag: 'Text', locator, match }, route, resolvedOn: route, located }),
      )
    return isTag(decideText({ kind: 'contains', value: needle }), 'Holds') &&
      isTag(decideText({ kind: 'contains', value: other }), 'DoesNotHold') &&
      isTag(decideText({ kind: 'exact', value: collapsed }), 'Holds') &&
      isTag(decideText({ kind: 'exact', value: other }), 'DoesNotHold')
  },
)

it.prop(
  '∀s_CheckEvaluate_≡TextFallsBackToName',
  {
    of: [Locator, Route, Schema.String, Schema.Int, Schema.Int, Schema.String],
    subject: checkEvaluate,
    arbitrary: { seed: 506_205 },
  },
  (subject, [locator, route, name, first, second, extra]) => {
    const node = nodeOf({ id: `${extra}${String(first)}`, name, hidden: false, disabled: false })
    const collapsed = name.replace(/\s+/gu, ' ').trim()
    const start = Math.abs(first) % (collapsed.length + 1)
    const stop = start + Math.abs(second) % (collapsed.length - start + 1)
    const needle = collapsed.slice(start, stop)
    const other = `${collapsed}${extra}${String(first)}`
    const located = [queriedOf(locator, [node])]
    const decideText = (match: TextMatch): CheckEvaluateDecision =>
      decisionOf(
        subject,
        new CheckEvaluate({ check: { _tag: 'Text', locator, match }, route, resolvedOn: route, located }),
      )
    return isTag(decideText({ kind: 'exact', value: collapsed }), 'Holds') &&
      isTag(decideText({ kind: 'contains', value: needle }), 'Holds') &&
      isTag(decideText({ kind: 'contains', value: other }), 'DoesNotHold')
  },
)

it.prop(
  '∀s_CheckEvaluate_≡TwoVisibleMatchesAreAmbiguous',
  {
    of: [Locator, Route, Schema.String, Schema.String, Schema.String, Schema.Boolean],
    subject: checkEvaluate,
    arbitrary: { seed: 506_206 },
  },
  (subject, [locator, route, first, second, name, disabled]) => {
    const nodes = [
      nodeOf({ id: first, name, hidden: false, disabled }),
      nodeOf({ id: second, name, hidden: false, disabled }),
    ]
    const located = [queriedOf(locator, nodes)]
    const decide = (check: Check): CheckEvaluateDecision =>
      decisionOf(subject, new CheckEvaluate({ check, route, resolvedOn: route, located }))
    const text = decide({ _tag: 'Text', locator, match: { kind: 'contains', value: name } })
    const value = decide({ _tag: 'Value', locator, match: { kind: 'exact', value: name } })
    const state = decide({ _tag: 'State', locator, state: 'checked', expected: disabled })
    const present = decide({ _tag: 'Present', locator })
    return isUnevaluable(text, 'ambiguous') &&
      isUnevaluable(value, 'ambiguous') &&
      isUnevaluable(state, 'ambiguous') &&
      isTag(present, 'Holds')
  },
)

it.prop(
  '∀s_CheckEvaluate_≡AbsentStateIsNoState',
  {
    of: [Locator, Route, Schema.String, Schema.Boolean, Schema.Boolean],
    subject: checkEvaluate,
    arbitrary: { seed: 506_207 },
  },
  (subject, [locator, route, id, disabled, expected]) => {
    const node = nodeOf({ id, hidden: false, disabled })
    const located = [queriedOf(locator, [node])]
    const decide = (check: Check): CheckEvaluateDecision =>
      decisionOf(subject, new CheckEvaluate({ check, route, resolvedOn: route, located }))
    const absent = decide({ _tag: 'State', locator, state: 'checked', expected })
    const disabledState = decide({ _tag: 'State', locator, state: 'disabled', expected: true })
    return isUnevaluable(absent, 'no-state') &&
      isTag(disabledState, disabled ? 'Holds' : 'DoesNotHold')
  },
)

it.prop(
  '∀s_CheckEvaluate_≡RouteChangedMakesLocatorLeavesStale',
  {
    of: [Locator, Route, Schema.String, Schema.String, Schema.Boolean],
    subject: checkEvaluate,
    arbitrary: { seed: 506_208 },
  },
  (subject, [locator, route, suffix, id, disabled]) => {
    const staleResolvedOn = { ...route, origin: `${route.origin}${suffix}${String(suffix.length)}` }
    const node = nodeOf({ id, hidden: false, disabled })
    const located = [queriedOf(locator, [node])]
    const decide = (check: Check): CheckEvaluateDecision =>
      decisionOf(subject, new CheckEvaluate({ check, route, resolvedOn: staleResolvedOn, located }))
    const present = decide({ _tag: 'Present', locator })
    const text = decide({ _tag: 'Text', locator, match: { kind: 'contains', value: suffix } })
    const notPresent = decide({ _tag: 'Not', check: { _tag: 'Present', locator } })
    return isUnevaluable(present, 'route-changed') &&
      isUnevaluable(text, 'route-changed') &&
      isUnevaluable(notPresent, 'route-changed')
  },
)

it.prop(
  '∀s_CheckEvaluate_≡VacuousAndKleenePrecedence',
  {
    of: [Locator, Route, Schema.String, Schema.Boolean, Schema.Finite, Schema.Finite],
    subject: checkEvaluate,
    arbitrary: { seed: 506_209 },
  },
  (subject, [locator, route, id, disabled, x, y]) => {
    const located = [queriedOf(locator, [nodeOf({ id, hidden: false, disabled })])]
    const fails: Check = { _tag: 'State', locator, state: 'disabled', expected: !disabled }
    const holds: Check = { _tag: 'State', locator, state: 'disabled', expected: disabled }
    const unsupported: Check = {
      _tag: 'Region',
      rect: { x, y, width: Math.abs(x), height: Math.abs(y) },
      tolerance: Math.abs(x) - Math.floor(Math.abs(x)),
    }
    const decide = (check: Check): CheckEvaluateDecision =>
      decisionOf(subject, new CheckEvaluate({ check, route, resolvedOn: route, located }))
    return isUnevaluable(decide({ _tag: 'AllOf', checks: [] }), 'vacuous') &&
      isUnevaluable(decide({ _tag: 'AnyOf', checks: [] }), 'vacuous') &&
      isTag(decide({ _tag: 'AllOf', checks: [fails, unsupported] }), 'DoesNotHold') &&
      isUnevaluable(decide({ _tag: 'AllOf', checks: [holds, unsupported] }), 'unsupported') &&
      isTag(decide({ _tag: 'AnyOf', checks: [holds, unsupported] }), 'Holds') &&
      isUnevaluable(decide({ _tag: 'AnyOf', checks: [fails, unsupported] }), 'unsupported')
  },
)

it.prop(
  '∀s_CheckEvaluate_≡RegionUnsupportedAndLocatorUnqueryable',
  {
    of: [Locator, Route, Schema.Finite, Schema.Finite, Schema.Finite, Schema.Finite],
    subject: checkEvaluate,
    arbitrary: { seed: 506_210 },
  },
  (subject, [locator, route, x, y, width, height]) => {
    const region: Check = {
      _tag: 'Region',
      rect: { x, y, width, height },
      tolerance: Math.abs(x) - Math.floor(Math.abs(x)),
    }
    const decided = decisionOf(subject, new CheckEvaluate({ check: region, route, resolvedOn: route, located: [] }))
    const missing = decisionOf(
      subject,
      new CheckEvaluate({ check: { _tag: 'Present', locator }, route, resolvedOn: route, located: [] }),
    )
    const unqueried = decisionOf(
      subject,
      new CheckEvaluate({
        check: { _tag: 'Present', locator },
        route,
        resolvedOn: route,
        located: [unqueriedOf(locator)],
      }),
    )
    return isUnevaluable(decided, 'unsupported') &&
      isUnevaluable(missing, 'unqueryable') &&
      isUnevaluable(unqueried, 'unqueryable')
  },
)

it.prop(
  '∀s_CheckEvaluate_≡RouteLeafFollowsObservedRoute',
  {
    of: [Route, NormalizedRoute, Schema.Array(Schema.String), Schema.String],
    subject: checkEvaluate,
    arbitrary: { seed: 506_211 },
  },
  (subject, [route, normalized, suffixes, suffix]) => {
    const observed = canonicalJsonOf(normalizeRoute(route))
    const same = observed === canonicalJsonOf(normalized)
    const extended: NormalizedRoute = {
      ...normalized,
      segments: [...normalized.segments, `${suffix}${String(suffixes.length)}`],
    }
    const extendedSame = observed === canonicalJsonOf(extended)
    const staleResolvedOn = { ...route, origin: `${route.origin}${suffix}${String(suffixes.length)}` }
    const decideRoute = (check: Check, resolvedOn: Route): CheckEvaluateDecision =>
      decisionOf(subject, new CheckEvaluate({ check, route, resolvedOn, located: [] }))
    const equalResolved = decideRoute({ _tag: 'Route', route: normalized }, route)
    const equalStale = decideRoute({ _tag: 'Route', route: normalized }, staleResolvedOn)
    const extendedResolved = decideRoute({ _tag: 'Route', route: extended }, staleResolvedOn)
    return isTag(equalResolved, same ? 'Holds' : 'DoesNotHold') &&
      isTag(equalStale, same ? 'Holds' : 'DoesNotHold') &&
      isTag(extendedResolved, extendedSame ? 'Holds' : 'DoesNotHold')
  },
)

it.prop(
  '∀s_CheckEvaluate_≡EveryDecisionLeadsWithObservedRoute',
  {
    of: [Check, Route, Route, Schema.String, Schema.Boolean],
    subject: checkEvaluate,
    arbitrary: { seed: 506_212 },
  },
  (subject, [check, route, resolvedOn, id, hidden]) => {
    const node = nodeOf({ id, hidden, disabled: false })
    const located = Arr.map(checkLocatorsOf(check), (locator) => queriedOf(locator, [node]))
    const decision = decisionOf(subject, new CheckEvaluate({ check, route, resolvedOn, located }))
    const head = Arr.head(decision.evidence)
    return Option.isSome(head) &&
      Match.valueTags(head.value, {
        RouteEvidence: (evidence) => JSON.stringify(evidence.route) === JSON.stringify(route),
        ScreenshotEvidence: () => false,
        LogEvidence: () => false,
        NodeEvidence: () => false,
      })
  },
)
