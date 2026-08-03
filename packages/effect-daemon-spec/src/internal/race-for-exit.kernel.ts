import { Effect, Exit, Fiber } from 'effect'

export const raceForExit = <A, E>(
  fibers: ReadonlyArray<Fiber.RuntimeFiber<A, E>>,
): Effect.Effect<readonly [number, Exit.Exit<A, E>]> =>
  Effect.raceAll(
    fibers.map((f, idx) =>
      f.await.pipe(
        Effect.map((exit): readonly [number, Exit.Exit<A, E>] => [idx, exit]),
      )
    ),
  )
