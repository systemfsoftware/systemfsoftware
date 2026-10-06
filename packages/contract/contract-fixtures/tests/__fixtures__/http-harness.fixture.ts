import {
  bundle,
  Harness,
  type HarnessOptions,
  type HarnessShape,
  type HarnessStartFailed,
  layer,
} from '@systemfsoftware/effect-workerd-harness'
import { Effect } from 'effect'

const worker = await Effect.runPromise(
  Effect.orDie(bundle(new URL('./http.worker.ts', import.meta.url).pathname)),
)

export const harnessOptions: HarnessOptions = { worker }

export const withHarness = <A, E, R>(
  program: (harness: HarnessShape) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | HarnessStartFailed, R> =>
  Effect.scoped(
    Effect.gen(function*() {
      const harness = yield* Harness
      return yield* program(harness)
    }).pipe(Effect.provide(layer(harnessOptions))),
  )
