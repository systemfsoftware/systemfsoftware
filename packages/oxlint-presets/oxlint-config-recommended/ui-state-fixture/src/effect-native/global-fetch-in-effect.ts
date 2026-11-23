import { Effect } from 'effect'

export const program = Effect.gen(function*() {
  yield* Effect.void
  return yield* Effect.promise(() => fetch('/demand'))
})
