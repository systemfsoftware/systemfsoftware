import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'

export interface CounterShape {
  readonly next: Effect.Effect<number>
}

export class Counter extends Context.Service<Counter, CounterShape>()('app/Counter') {
  static readonly make = Effect.map(Ref.make(0), (ref) => Counter.of({ next: Ref.updateAndGet(ref, (n) => n + 1) }))

  static readonly layer = Layer.effect(this, this.make)

  static readonly layerTest = Layer.succeed(this, Counter.of({ next: Effect.succeed(1) }))
}
