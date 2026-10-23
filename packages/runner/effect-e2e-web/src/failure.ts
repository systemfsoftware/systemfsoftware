import type { Locator, NodeRef, Route } from '@systemfsoftware/effect-e2e/engine'
import {
  ActionFailed,
  AppUnreachable,
  AutomationUnsupported,
  LocatorAmbiguous,
  LocatorNotFound,
} from '@systemfsoftware/effect-e2e/engine'
import * as Arr from 'effect/Array'

export type TargetFailure = LocatorNotFound | LocatorAmbiguous | ActionFailed

export interface FailedOnTarget {
  readonly target: Locator
  readonly route: Route
  readonly matches: ReadonlyArray<NodeRef>
  readonly reason: string
}

const describe = (locator: Locator): string => `${locator.label} (${JSON.stringify(locator.expression)})`

const notFound = (failed: FailedOnTarget): LocatorNotFound =>
  new LocatorNotFound({
    message: `no element matches ${describe(failed.target)}`,
    evidence: [{ _tag: 'RouteEvidence', route: failed.route }],
  })

const ambiguous = (failed: FailedOnTarget, matches: Arr.NonEmptyReadonlyArray<NodeRef>): LocatorAmbiguous =>
  new LocatorAmbiguous({
    message: `${matches.length} elements match ${describe(failed.target)}`,
    evidence: Arr.map(matches, (ref) => ({ _tag: 'NodeEvidence', ref }) as const),
  })

const inoperable = (failed: FailedOnTarget, ref: NodeRef): ActionFailed =>
  new ActionFailed({
    message: `${describe(failed.target)} cannot be used: ${failed.reason}`,
    evidence: [{ _tag: 'NodeEvidence', ref }],
  })

const ofMatches = (failed: FailedOnTarget) => (matches: Arr.NonEmptyReadonlyArray<NodeRef>): TargetFailure =>
  Arr.isReadonlyArrayNonEmpty(Arr.tailNonEmpty(matches))
    ? ambiguous(failed, matches)
    : inoperable(failed, Arr.headNonEmpty(matches))

export const targetFailureOf = (failed: FailedOnTarget): TargetFailure =>
  Arr.match(failed.matches, { onEmpty: () => notFound(failed), onNonEmpty: ofMatches(failed) })

export const unreachable = (url: string) => (reason: string): AppUnreachable =>
  new AppUnreachable({
    message: `${url} could not be opened: ${reason}`,
    evidence: [{ _tag: 'LogEvidence', text: reason }],
  })

export const unsupported = (what: string): AutomationUnsupported =>
  new AutomationUnsupported({
    message: `the web engine does not support ${what}`,
    evidence: [{ _tag: 'LogEvidence', text: what }],
  })

export const pointerFailed = (reason: string): ActionFailed =>
  new ActionFailed({
    message: `the pointer action failed: ${reason}`,
    evidence: [{ _tag: 'LogEvidence', text: reason }],
  })
