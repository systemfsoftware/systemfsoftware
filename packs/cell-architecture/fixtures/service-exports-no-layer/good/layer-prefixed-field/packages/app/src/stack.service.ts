import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'

export class Stack extends Context.Service<Stack, { readonly depth: Effect.Effect<number> }>()('app/Stack') {
  static readonly layerCount = 3
}
