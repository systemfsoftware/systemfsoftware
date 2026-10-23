import type { LogEntry, NodeRef, SemanticNode } from '@systemfsoftware/effect-e2e/engine'
import { type Locator as EngineLocator } from '@systemfsoftware/effect-e2e/engine'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import type { BrowserContext, Locator, Page } from 'playwright'

import { matchedNodeOf, type SnapshotNaming, unrootedRefOf } from './aria-tree.js'
import { type TargetFailure, targetFailureOf } from './failure.js'
import { routeOf } from './route.js'
import { AriaAnswer } from './web.schema.js'

export interface OpenSession {
  readonly context: BrowserContext
  readonly page: Page
  readonly logs: Ref.Ref<ReadonlyArray<LogEntry>>
  readonly revision: Ref.Ref<number>
  readonly snapshots: Ref.Ref<number>
}

export const SNAPSHOT_DEPTH = 60

const firstLineOf = (text: string): string => Option.getOrElse(Arr.head(text.split('\n')), () => text)

export const attempt = <A>(run: () => Promise<A>): Effect.Effect<A, string> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => (Predicate.isError(cause) ? firstLineOf(cause.message) : 'the browser driver rejected the call'),
  })

const revisionOf = (open: OpenSession): Effect.Effect<string> => Effect.map(Ref.get(open.revision), String)

export const namingOf = (open: OpenSession): Effect.Effect<SnapshotNaming> =>
  Effect.all({
    revision: revisionOf(open),
    snapshot: Ref.modify(open.snapshots, (taken) => [`s${taken}`, taken + 1] as const),
  })

export const snapshotOf = (locator: Locator): Effect.Effect<AriaAnswer, string | Schema.SchemaError> =>
  attempt(() => locator.ariaSnapshotJSON({ mode: 'ai', boxes: true, depth: SNAPSHOT_DEPTH })).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(AriaAnswer)),
  )

export interface Matching {
  readonly open: OpenSession
  readonly locator: Locator
}

export const matchedAt =
  ({ open, locator }: Matching) => (index: number): Effect.Effect<SemanticNode, string | Schema.SchemaError> =>
    Effect.gen(function*() {
      const match = locator.nth(index)
      const naming = yield* namingOf(open)
      const answer = yield* snapshotOf(match)
      const bounds = yield* attempt(() => match.boundingBox())
      return matchedNodeOf({ naming, answer, bounds: Option.fromNullishOr(bounds) })
    })

const refAt = (open: OpenSession, locator: Locator) => (index: number): Effect.Effect<NodeRef> =>
  matchedAt({ open, locator })(index).pipe(
    Effect.map((node) => node.ref),
    Effect.catch(() => Effect.map(namingOf(open), unrootedRefOf)),
  )

const matchesOf = (open: OpenSession, locator: Locator): Effect.Effect<ReadonlyArray<NodeRef>> =>
  Effect.gen(function*() {
    const count = yield* attempt(() => locator.count()).pipe(Effect.orElseSucceed(() => 0))
    return yield* Effect.forEach(Array.from({ length: count }, (_, index) => index), refAt(open, locator))
  })

export interface Targeted {
  readonly open: OpenSession
  readonly target: EngineLocator
  readonly locator: Locator
}

export const failedOn = (targeted: Targeted) => (reason: string): Effect.Effect<TargetFailure> =>
  Effect.map(
    matchesOf(targeted.open, targeted.locator),
    (matches) =>
      targetFailureOf({ target: targeted.target, route: routeOf(targeted.open.page.url()), matches, reason }),
  )

export const onTarget =
  (targeted: Targeted) => <A>(run: (located: Locator) => Promise<A>): Effect.Effect<A, TargetFailure> =>
    attempt(() => run(targeted.locator)).pipe(Effect.catch((reason) => Effect.flip(failedOn(targeted)(reason))))
