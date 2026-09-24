import { Observation, ObservationWindow } from '@systemfsoftware/trace-spec'
import { Context, Data, Effect, Layer, Option, Ref, Result, Schema } from 'effect'
import type * as Scope from 'effect/Scope'

export class ExporterStillHolding extends Data.TaggedError('ExporterStillHolding')<{ readonly reason: string }> {}

interface Opened {
  readonly collector: Observation.Collector
  readonly traceId: string
}

export interface WindowRelease {
  readonly program: Effect.Effect<void, never, Scope.Scope>
  readonly probe: Effect.Effect<void, ExporterStillHolding>
}

const STILL_HOLDING = 'the window still hands back the span it recorded, so its exporter was never shut down'

export const windowRelease = (serviceName: string): Effect.Effect<WindowRelease> =>
  Effect.gen(function*() {
    const opened = yield* Ref.make<Option.Option<Opened>>(Option.none())
    return {
      program: Effect.gen(function*() {
        const context = yield* Layer.build(ObservationWindow.make(serviceName).layer)
        const recorded = yield* Effect.withSpan('window.release.span')(Effect.orDie(Effect.currentSpan)).pipe(
          Effect.provide(context),
        )
        yield* Ref.set(
          opened,
          Option.some({ collector: Context.get(context, Observation.Observation), traceId: recorded.traceId }),
        )
      }),
      probe: Effect.flatMap(
        Ref.get(opened),
        Option.match({
          onNone: () => Effect.void,
          onSome: (window) =>
            Effect.flatMap(Effect.result(window.collector.collect(window.traceId)), (outcome) =>
              Result.isFailure(outcome) && Schema.is(Observation.EmptyObservationError)(outcome.failure)
                ? Effect.void
                : Effect.fail(new ExporterStillHolding({ reason: STILL_HOLDING }))),
        }),
      ),
    }
  })
