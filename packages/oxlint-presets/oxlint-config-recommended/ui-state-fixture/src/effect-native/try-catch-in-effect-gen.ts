import { Effect } from 'effect'

export const program = Effect.gen(function*() {
  try {
    yield* Effect.void
  } catch {
    return 1
  }
  return 0
})
