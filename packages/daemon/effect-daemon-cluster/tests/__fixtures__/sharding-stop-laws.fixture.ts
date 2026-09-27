/**
 * The stop-behavior law cases a `Sharding.Sharding` adapter must obey, written once so the
 * scripted double the cluster medium's conformance checks use and the real `SingleRunner` over
 * PGlite both run them (KTD8; pack `compound-packs/boundary-testing/fake-and-real-store-laws.md`).
 *
 * The laws are the sharding contract the cluster medium's stop rule reads: a free name is
 * accepted and its program runs; a program stopped mid-call is interrupted when its registration
 * scope closes; a name released by a stop is free again, so a restart runs a fresh program; and a
 * run killed mid-call leaves its name free for the process that restarts. The cases are built per
 * adapter and judge themselves, so the same expectation is not restated per side.
 */
import { Cause, Data, Deferred, Duration, Effect, Exit, Option, Scope } from 'effect'
import { Sharding } from 'effect/unstable/cluster'

interface ShardingAdapter {
  readonly registerSingleton: <E, R>(
    name: string,
    run: Effect.Effect<void, E, R>,
    options?: { readonly shardGroup?: string | undefined },
  ) => Effect.Effect<void, never, R | Scope.Scope>
}

/** A law that did not hold, naming the law and the answer the adapter gave instead. */
export class ShardingLawBroken extends Data.TaggedError('ShardingLawBroken')<{
  readonly law: string
  readonly observed: string
}> {}

/** One self-judging law case: it succeeds only when the adapter obeys the law. */
export interface ShardingStopLaw {
  readonly name: string
  readonly check: Effect.Effect<void, ShardingLawBroken>
}

/** The adapter under test and the adapter a restarted process would yield. */
export interface ShardingStopSubject {
  readonly sharding: ShardingAdapter
  readonly restarted: Effect.Effect<ShardingAdapter, never, Scope.Scope>
}

/** How long a law waits for a program it registered to run before calling it never-run. */
const RAN_WITHIN = Duration.seconds(2)

const registrationScope = (
  sharding: ShardingAdapter,
  name: string,
  run: Effect.Effect<void, never, never>,
  scope: Scope.Scope,
): Effect.Effect<void> => sharding.registerSingleton(name, run).pipe(Effect.provideService(Scope.Scope, scope))

const ranWithin = (signalled: Deferred.Deferred<void>): Effect.Effect<boolean> =>
  Deferred.await(signalled).pipe(Effect.timeoutOption(RAN_WITHIN), Effect.map(Option.isSome))

const accepted = (sharding: ShardingAdapter): ShardingStopLaw => ({
  name: 'accepts a registration while the name is free and runs its program',
  check: Effect.gen(function*() {
    const started = yield* Deferred.make<void>()
    const scope = yield* Scope.make()
    yield* registrationScope(sharding, 'laws/accepted', Effect.asVoid(Deferred.succeed(started, void 0)), scope)
    const ran = yield* ranWithin(started)
    yield* Scope.close(scope, Exit.void)
    if (!ran) {
      return yield* new ShardingLawBroken({
        law: 'accepts a registration while the name is free and runs its program',
        observed: 'the registered program never ran',
      })
    }
  }),
})

const interrupted = (sharding: ShardingAdapter): ShardingStopLaw => ({
  name: 'interrupts a program that is mid-call when its registration scope closes',
  check: Effect.gen(function*() {
    const running = yield* Deferred.make<void>()
    const interrupted = yield* Deferred.make<void>()
    const scope = yield* Scope.make()
    yield* registrationScope(
      sharding,
      'laws/interrupted',
      Effect.gen(function*() {
        yield* Deferred.succeed(running, void 0)
        return yield* Effect.never
      }).pipe(Effect.onInterrupt(() => Effect.asVoid(Deferred.succeed(interrupted, void 0)))),
      scope,
    )
    yield* Deferred.await(running)
    yield* Scope.close(scope, Exit.void)
    const stopped = yield* Deferred.isDone(interrupted)
    if (!stopped) {
      return yield* new ShardingLawBroken({
        law: 'interrupts a program that is mid-call when its registration scope closes',
        observed: 'the program was still running after its registration scope closed',
      })
    }
  }),
})

const released = (sharding: ShardingAdapter): ShardingStopLaw => ({
  name: 'frees the name when the registration scope closes, so a restart runs a fresh program',
  check: Effect.gen(function*() {
    const first = yield* Scope.make()
    yield* registrationScope(sharding, 'laws/released', Effect.never, first)
    yield* Scope.close(first, Exit.void)
    const restarted = yield* Deferred.make<void>()
    const second = yield* Scope.make()
    const registration = yield* sharding
      .registerSingleton('laws/released', Effect.asVoid(Deferred.succeed(restarted, void 0)))
      .pipe(Effect.provideService(Scope.Scope, second), Effect.exit)
    const ran = yield* ranWithin(restarted)
    yield* Scope.close(second, Exit.void)
    if (Exit.isFailure(registration)) {
      return yield* new ShardingLawBroken({
        law: 'frees the name when the registration scope closes, so a restart runs a fresh program',
        observed: `the name stayed held after its registration scope closed: ${Cause.pretty(registration.cause)}`,
      })
    }
    if (!ran) {
      return yield* new ShardingLawBroken({
        law: 'frees the name when the registration scope closes, so a restart runs a fresh program',
        observed: 'the restarted program never ran',
      })
    }
  }),
})

const killed = (subject: ShardingStopSubject): ShardingStopLaw => ({
  name: 'frees the name of a run killed mid-call, so the restarted process runs a fresh program',
  check: Effect.scoped(Effect.gen(function*() {
    const ambient = yield* Effect.scope
    yield* registrationScope(subject.sharding, 'laws/killed', Effect.never, ambient)
    const restarted = yield* Deferred.make<void>()
    const fresh = yield* subject.restarted
    const registration = yield* fresh
      .registerSingleton('laws/killed', Effect.asVoid(Deferred.succeed(restarted, void 0)))
      .pipe(Effect.exit)
    const ran = yield* ranWithin(restarted)
    if (Exit.isFailure(registration)) {
      return yield* new ShardingLawBroken({
        law: 'frees the name of a run killed mid-call, so the restarted process runs a fresh program',
        observed: `the restarted process could not take the name: ${Cause.pretty(registration.cause)}`,
      })
    }
    if (!ran) {
      return yield* new ShardingLawBroken({
        law: 'frees the name of a run killed mid-call, so the restarted process runs a fresh program',
        observed: 'the restarted process never ran its program',
      })
    }
  })),
})

export const shardingStopLaws = (subject: ShardingStopSubject): ReadonlyArray<ShardingStopLaw> => [
  accepted(subject.sharding),
  interrupted(subject.sharding),
  released(subject.sharding),
  killed(subject),
]

/** One law's outcome: its name and, when it did not hold, what the adapter answered instead. */
export interface ShardingLawResult {
  readonly law: string
  readonly broken: string | undefined
}

const observedOf = (exit: Exit.Exit<void, ShardingLawBroken>): string =>
  Exit.match(exit, {
    onSuccess: () => 'held',
    onFailure: (cause) =>
      Option.match(Cause.findErrorOption(cause), {
        onNone: () => Cause.pretty(cause),
        onSome: (error) => error.observed,
      }),
  })

const resultOf = (law: ShardingStopLaw): Effect.Effect<ShardingLawResult> =>
  Effect.map(Effect.exit(law.check), (exit): ShardingLawResult => ({
    law: law.name,
    broken: Exit.isSuccess(exit) ? undefined : observedOf(exit),
  }))

/**
 * Runs every law against the sharding in context and the restarted process it is given, and
 * reports their outcomes; a broken law does not stop the sweep, so a passing side proves all of
 * them, not just the first.
 */
export const shardingStopLawResults = (
  restarted: Effect.Effect<ShardingAdapter, never, Scope.Scope>,
): Effect.Effect<ReadonlyArray<ShardingLawResult>, never, Sharding.Sharding> =>
  Effect.flatMap(
    Sharding.Sharding,
    (sharding) => Effect.forEach(shardingStopLaws({ sharding, restarted }), resultOf, { concurrency: 1 }),
  )
