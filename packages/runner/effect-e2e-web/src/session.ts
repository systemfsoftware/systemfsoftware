import type { LogEntry, NodeRef } from '@systemfsoftware/effect-e2e/engine'
import { type Locator as EngineLocator } from '@systemfsoftware/effect-e2e/engine'
import * as Arr from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Ref from 'effect/Ref'
import * as Schema from 'effect/Schema'
import type { BrowserContext, Locator, Page } from 'playwright'

import { type TargetFailure, targetFailureOf } from './failure.js'
import { routeOf } from './route.js'
import { AriaAnswer, type AriaChild } from './web.schema.js'

export interface OpenSession {
  readonly context: BrowserContext
  readonly page: Page
  readonly logs: Ref.Ref<ReadonlyArray<LogEntry>>
  readonly revision: Ref.Ref<number>
}

export const SNAPSHOT_DEPTH = 60

const firstLineOf = (text: string): string => Option.getOrElse(Arr.head(text.split('\n')), () => text)

export const attempt = <A>(run: () => Promise<A>): Effect.Effect<A, string> =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => (Predicate.isError(cause) ? firstLineOf(cause.message) : 'the browser driver rejected the call'),
  })

export const revisionOf = (open: OpenSession): Effect.Effect<string> => Effect.map(Ref.get(open.revision), String)

export const snapshotOf = (locator: Locator): Effect.Effect<AriaAnswer, string | Schema.SchemaError> =>
  attempt(() => locator.ariaSnapshotJSON({ mode: 'ai', boxes: true, depth: SNAPSHOT_DEPTH })).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(AriaAnswer)),
  )

const refIn = (snapshot: AriaAnswer): Option.Option<string> =>
  Arr.findFirst(
    snapshot,
    (child: AriaChild) => (Predicate.isString(child) ? Option.none() : Option.fromNullishOr(child.ref)),
  )

const refAt = (locator: Locator, revision: string) => (index: number): Effect.Effect<NodeRef> =>
  attempt(() => locator.nth(index).ariaSnapshotJSON({ mode: 'ai', depth: 1 })).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(AriaAnswer)),
    Effect.map(refIn),
    Effect.map(Option.getOrElse(() => `match-${index}`)),
    Effect.orElseSucceed(() => `match-${index}`),
    Effect.map((id) => ({ id, revision })),
  )

const matchesOf = (open: OpenSession, locator: Locator): Effect.Effect<ReadonlyArray<NodeRef>> =>
  Effect.gen(function*() {
    const revision = yield* revisionOf(open)
    const count = yield* attempt(() => locator.count()).pipe(Effect.orElseSucceed(() => 0))
    return yield* Effect.forEach(Array.from({ length: count }, (_, index) => index), refAt(locator, revision))
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
