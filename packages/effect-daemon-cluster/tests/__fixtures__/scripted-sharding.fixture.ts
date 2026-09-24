/**
 * A scripted sharding: the `Sharding.Sharding` port double the cluster medium's conformance
 * checks drive the real medium and its conformance driver through.
 *
 * It models what `registerSingleton` documents — a name is registered for the caller's scope, a
 * second registration of a held name defects, the registered program runs while the name is held,
 * and releasing that scope interrupts the program and frees the name — and nothing else. Every
 * other member defects, naming the part of sharding the double does not model, so a check that
 * reaches one fails loudly instead of reading a made-up answer.
 */
import { Conformance } from '@systemfsoftware/conformance-spec'
import { Array as Arr, Context, Data, Effect, Layer, Match, Ref, Stream } from 'effect'
import type * as Scope from 'effect/Scope'
import { ShardId, Sharding } from 'effect/unstable/cluster'

/** A singleton name the run registered and never released. */
export class RegistrationLeftHeld extends Data.TaggedError('RegistrationLeftHeld')<{
  readonly names: ReadonlyArray<string>
}> {}

/** A run the check could not judge. */
export class CheckRejected extends Data.TaggedError('CheckRejected')<{ readonly report: string }> {}

export class ChildReportedOtherThanShutdown extends Data.TaggedError('ChildReportedOtherThanShutdown')<{
  readonly observed: string
}> {}

export class RunningChildAnsweredDead extends Data.TaggedError('RunningChildAnsweredDead')<{}> {}

export class ChildNotReportedAsInferredDeath extends Data.TaggedError('ChildNotReportedAsInferredDeath')<{
  readonly observed: string
}> {}

/** What the scripted sharding held, readable after a run without holding the run's environment. */
export class RegistrationLedger extends Context.Service<
  RegistrationLedger,
  {
    readonly held: Effect.Effect<ReadonlyArray<string>>
  }
>()('@systemfsoftware/effect-daemon-cluster/tests/cluster-medium.conformance.test/RegistrationLedger') {}

/** The release probe: no name the run registered is still held. */
export const nothingLeftRegistered: Effect.Effect<void, RegistrationLeftHeld, RegistrationLedger> = Effect.flatMap(
  Effect.service(RegistrationLedger),
  (ledger) =>
    Effect.flatMap(
      ledger.held,
      (names) => names.length === 0 ? Effect.void : Effect.fail(new RegistrationLeftHeld({ names })),
    ),
)

/** The count of interruption points a release check explored, or the report that says it did not pass. */
export const passedInterruptions = (report: Conformance.Report<never, never>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.histories),
    Match.orElse(() => {
      throw new CheckRejected({ report: Conformance.render(report) })
    }),
  )

const unmodelled = (member: string): Effect.Effect<never> =>
  Effect.die(new globalThis.Error(`the scripted sharding does not model ${member}`))

const holding = (
  held: Ref.Ref<ReadonlyArray<string>>,
  name: string,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.gen(function*() {
      const added = yield* Ref.modify(held, (names) =>
        Arr.contains(names, name) ? [false, names] as const : [true, [...names, name]] as const)
      if (!added) {
        return yield* Effect.die(`Singleton '${name}' is already registered`)
      }
    }),
    () =>
      Ref.update(held, (names) => Arr.filter(names, (registered) => registered !== name)),
  )

/**
 * The double and the ledger it writes: one per scenario, so a scenario's registration counts are
 * its own and a probe reads what that scenario's runs did.
 */
export const scriptedSharding: Layer.Layer<Sharding.Sharding | RegistrationLedger> = Layer.unwrap(
  Effect.gen(function*() {
    const held = yield* Ref.make<ReadonlyArray<string>>([])
    return Layer.mergeAll(
      Layer.succeed(
        Sharding.Sharding,
        Sharding.Sharding.of({
          getRegistrationEvents: Stream.empty,
          getShardId: () => ShardId.make('default', 0),
          hasShardId: () => true,
          getSnowflake: unmodelled('snowflake generation'),
          isShutdown: Effect.succeed(false),
          makeClient: () => unmodelled('entity clients'),
          registerEntity: () => unmodelled('entity registration'),
          registerSingleton: (name, run) => Effect.andThen(holding(held, name), Effect.forkScoped(run)),
          send: () => unmodelled('message routing'),
          sendOutgoing: () => unmodelled('outgoing messages'),
          notify: () => unmodelled('message notification'),
          reset: () => Effect.succeed(false),
          pollStorage: Effect.void,
          activeEntityCount: Effect.succeed(0),
        }),
      ),
      Layer.succeed(RegistrationLedger, {
        held: Ref.get(held),
      }),
    )
  }),
)
