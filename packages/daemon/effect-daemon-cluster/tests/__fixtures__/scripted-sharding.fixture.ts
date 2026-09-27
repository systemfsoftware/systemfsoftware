/**
 * A scripted sharding: the `Sharding.Sharding` port double the cluster medium's conformance
 * checks drive the real medium and its conformance driver through.
 *
 * It models what `registerSingleton` documents — a name is registered for the caller's scope, the
 * registered program runs while the name is held, and releasing that scope interrupts the program
 * and frees the name — and nothing else. Every other member defects, naming the part of sharding
 * the double does not model, so a check that reaches one fails loudly instead of reading a made-up
 * answer.
 */
import { Array as Arr, Context, Data, Effect, Layer, Ref, Stream } from 'effect'
import type * as Scope from 'effect/Scope'
import { ShardId, Sharding } from 'effect/unstable/cluster'

export class ChildReportedOtherThanShutdown extends Data.TaggedError('ChildReportedOtherThanShutdown')<{
  readonly observed: string
}> {}

export class RunningChildAnsweredDead extends Data.TaggedError('RunningChildAnsweredDead')<{}> {}

export class ChildNotReportedAsInferredDeath extends Data.TaggedError('ChildNotReportedAsInferredDeath')<{
  readonly observed: string
}> {}

/**
 * What the scripted sharding held and what the run reported, readable after a run
 * without holding the run's environment. The reason log survives a cut so the rule can
 * judge the termination the medium answered after the restart.
 */
export class RegistrationLedger extends Context.Service<
  RegistrationLedger,
  {
    readonly held: Effect.Effect<ReadonlyArray<string>>
    readonly reasons: Effect.Effect<ReadonlyArray<string>>
    readonly record: (reason: string) => Effect.Effect<void>
  }
>()('@systemfsoftware/effect-daemon-cluster/tests/cluster-medium.conformance.test/RegistrationLedger') {}

const unmodelled = (member: string): Effect.Effect<never> =>
  Effect.die(new globalThis.Error(`the scripted sharding does not model ${member}`))

const holding = (
  held: Ref.Ref<ReadonlyArray<string>>,
  name: string,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.acquireRelease(
    Ref.update(held, (names) => [...Arr.filter(names, (registered) => registered !== name), name]),
    () => Ref.update(held, (names) => Arr.filter(names, (registered) => registered !== name)),
  )

/**
 * The double and the ledger it writes: one per scenario, so a scenario's registration counts are
 * its own and a probe reads what that scenario's runs did.
 */
export const scriptedSharding: Layer.Layer<Sharding.Sharding | RegistrationLedger> = Layer.unwrap(
  Effect.gen(function*() {
    const held = yield* Ref.make<ReadonlyArray<string>>([])
    const reasons = yield* Ref.make<ReadonlyArray<string>>([])
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
        reasons: Ref.get(reasons),
        record: (reason) => Ref.update(reasons, (all) => [...all, reason]),
      }),
    )
  }),
)
