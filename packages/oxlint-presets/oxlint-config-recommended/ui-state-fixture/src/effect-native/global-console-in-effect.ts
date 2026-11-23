import { Effect } from 'effect'

export const program = Effect.gen(function*() {
  yield* Effect.void
  console.log('hello')
})
