import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

export interface ClockShape {
  readonly now: Effect.Effect<number>
}

export class Clock extends Context.Service<Clock, ClockShape>()('app/Clock') {
  static readonly layer: Layer.Layer<Clock> = Layer.succeed(Clock, Clock.of({ now: Effect.succeed(0) }))
}
