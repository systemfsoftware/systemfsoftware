import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'

export interface ClockShape {
  readonly now: Effect.Effect<number>
}

export class Clock extends Context.Service<Clock, ClockShape>()('app/Clock') {}

export const now = Effect.flatMap(Clock.asEffect(), (clock) => clock.now)
