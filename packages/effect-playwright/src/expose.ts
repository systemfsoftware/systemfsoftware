import { Effect, type Scope } from 'effect'
import { dual } from 'effect/Function'
import type { BrowserContext, Page } from 'playwright-core'
import type { PlaywrightError } from './errors.schema.js'
import { acquire } from './lift.js'

export interface Binding<A, E, R, Args extends ReadonlyArray<Arg>, Arg = unknown> {
  readonly name: string
  readonly run: (...args: Args) => Effect.Effect<A, E, R>
}

const exposeScoped = <A, E, R, Args extends ReadonlyArray<Arg>, Arg = unknown>(
  target: Page | BrowserContext,
  { name, run }: Binding<A, E, R, Args, Arg>,
): Effect.Effect<void, PlaywrightError, R | Scope.Scope> =>
  Effect.context<R>().pipe(
    Effect.map((context) => Effect.runPromiseWith(context)),
    Effect.flatMap((runPromise) =>
      acquire(() => target.exposeFunction(name, (...args: Args) => runPromise(run(...args))))
    ),
    Effect.asVoid,
  )

export const expose: {
  <A, E, R, Args extends ReadonlyArray<Arg>, Arg = unknown>(
    binding: Binding<A, E, R, Args, Arg>,
  ): (target: Page | BrowserContext) => Effect.Effect<void, PlaywrightError, R | Scope.Scope>
  <A, E, R, Args extends ReadonlyArray<Arg>, Arg = unknown>(
    target: Page | BrowserContext,
    binding: Binding<A, E, R, Args, Arg>,
  ): Effect.Effect<void, PlaywrightError, R | Scope.Scope>
} = dual(2, exposeScoped)
