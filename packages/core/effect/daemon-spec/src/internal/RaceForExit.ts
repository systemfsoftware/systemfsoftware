import { Effect, Exit, Fiber } from 'effect'

export const raceForExit = <A, E>(
  fibers: readonly Fiber.Fiber<A, E>[],
): Effect.Effect<readonly [number, Exit.Exit<A, E>]> =>
  Effect.raceAll(
    fibers.map((f, idx) =>
      Fiber.await(f).pipe(
        Effect.map((exit): readonly [number, Exit.Exit<A, E>] => [idx, exit]),
      )
    ),
  )
