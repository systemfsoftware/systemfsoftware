import { BoundedIntensity, Daemon, oneForOne, restForOne, run, Supervision } from '@systemfsoftware/effect-daemon-spec'
import type { Worker } from '@systemfsoftware/effect-daemon-spec'
import { Array as Arr, Context, Deferred, Duration, Effect, Layer, Match, Option, Ref, Schedule, Stream } from 'effect'

import { NoopLayer } from './SharedLayers.js'
import type { SupervisionFamily, SupervisionRestartCommand } from './supervision-restart.model.js'
import { supervisionRestart } from './supervision-restart.model.js'
import { ChildFailed } from './supervision-restart.schema.js'

const FAMILY_SIZE = 3

type Signals = ReadonlyArray<Deferred.Deferred<void>>
type Arrivals = ReadonlyArray<Option.Option<Deferred.Deferred<void>>>
type SupervisedChild = Worker<ChildFailed, never, { readonly mode: 'none' }>

export interface SupervisionRestartHandle {
  readonly failChild: (index: number) => Effect.Effect<ReadonlyArray<number>>
}

export class SupervisionRestart extends Context.Service<SupervisionRestart, SupervisionRestartHandle>()(
  '@systemfsoftware/effect-daemon-spec/tests/__fixtures__/supervision-restart/SupervisionRestart',
) {}

const markStarted = (
  index: number,
  starts: Ref.Ref<ReadonlyArray<number>>,
  arrivals: Ref.Ref<Arrivals>,
): Effect.Effect<void> =>
  Effect.gen(function*() {
    yield* Ref.update(starts, (values) => values.map((value, position) => position === index ? value + 1 : value))
    const slots = yield* Ref.get(arrivals)
    yield* Option.match(Option.flatten(Arr.get(slots, index)), {
      onNone: () => Effect.void,
      onSome: (arrival) => Deferred.succeed(arrival, void 0),
    })
  })

const awaitFailure = (index: number, signals: Ref.Ref<Signals>): Effect.Effect<void, ChildFailed> =>
  Effect.gen(function*() {
    const all = yield* Ref.get(signals)
    yield* Option.match(Arr.get(all, index), {
      onNone: () => Effect.void,
      onSome: (signal) => Deferred.await(signal),
    })
    return yield* new ChildFailed({ index })
  })

const supervisedChild = (
  index: number,
  starts: Ref.Ref<ReadonlyArray<number>>,
  signals: Ref.Ref<Signals>,
  arrivals: Ref.Ref<Arrivals>,
): SupervisedChild =>
  Daemon.stream({
    name: `supervised-child-${index}`,
    stream: Stream.concat(
      Stream.fromEffect(markStarted(index, starts, arrivals)),
      Stream.fromEffect(awaitFailure(index, signals)),
    ),
    tick: { tickTimeout: Duration.seconds(90) },
    lock: { mode: 'none' },
  })

const supervisionPolicy = Supervision.custom({
  intensity: BoundedIntensity.make({ restarts: 1_000_000, window: Duration.days(3650) }),
  backoff: Schedule.exponential(Duration.millis(1), 1),
  cooldown: Duration.minutes(30),
})

const supervisorOf = (
  family: SupervisionFamily,
  children: ReadonlyArray<SupervisedChild>,
) =>
  Match.value(family).pipe(
    Match.when('one_for_one', () =>
      oneForOne({ name: 'one-for-one-family', children, supervision: supervisionPolicy, lock: { mode: 'none' } })),
    Match.when('rest_for_one', () =>
      restForOne({ name: 'rest-for-one-family', children, supervision: supervisionPolicy, lock: { mode: 'none' } })),
    Match.exhaustive,
  )

const slot = (
  restarted: ReadonlyArray<number>,
  departures: ReadonlyArray<Deferred.Deferred<void>>,
  position: number,
): Option.Option<Deferred.Deferred<void>> => {
  const at = restarted.indexOf(position)
  return at === -1 ? Option.none() : Arr.get(departures, at)
}

export const familyLayer = (family: SupervisionFamily): Layer.Layer<SupervisionRestart> =>
  Layer.effect(
    SupervisionRestart,
    Effect.gen(function*() {
      const starts = yield* Ref.make<ReadonlyArray<number>>([0, 0, 0])
      const signals = yield* Ref.make<Signals>(
        yield* Effect.forEach(Arr.range(0, FAMILY_SIZE - 1), () => Deferred.make<void>()),
      )
      const arrivals = yield* Ref.make<Arrivals>(
        Arr.range(0, FAMILY_SIZE - 1).map(() => Option.none<Deferred.Deferred<void>>()),
      )
      const children = Arr.range(0, FAMILY_SIZE - 1).map((index) => supervisedChild(index, starts, signals, arrivals))
      const health = yield* run.supervisor(supervisorOf(family, children)).pipe(Effect.provide(NoopLayer))
      yield* health.ready.await
      const failChild = (index: number): Effect.Effect<ReadonlyArray<number>> =>
        Effect.gen(function*() {
          const restarted = supervisionRestart.restartedBy(family, index)
          const departures: ReadonlyArray<Deferred.Deferred<void>> = yield* Effect.forEach(
            restarted,
            () => Deferred.make<void>(),
          )
          yield* Ref.set(
            arrivals,
            Arr.range(0, FAMILY_SIZE - 1).map((position) => slot(restarted, departures, position)),
          )
          const fresh = yield* Deferred.make<void>()
          const previous = yield* Ref.modify(
            signals,
            (all) =>
              [
                Arr.get(all, index),
                all.map((signal, position) => position === index ? fresh : signal),
              ] as const,
          )
          yield* Option.match(previous, {
            onNone: () => Effect.void,
            onSome: (signal) => Deferred.succeed(signal, void 0),
          })
          yield* Effect.forEach(departures, (departure) => Deferred.await(departure))
          return yield* Ref.get(starts)
        })
      return SupervisionRestart.of({ failChild })
    }),
  )

export const runSupervisionRestartCommand = (
  command: SupervisionRestartCommand,
): Effect.Effect<ReadonlyArray<number>, never, SupervisionRestart> =>
  Effect.flatMap(SupervisionRestart, (supervision) => supervision.failChild(command.index))
