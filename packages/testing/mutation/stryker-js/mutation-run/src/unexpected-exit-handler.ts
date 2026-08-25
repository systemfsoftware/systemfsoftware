import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'

export type ExitHandler = () => void

export class UnexpectedExitHandler extends Context.Service<
  UnexpectedExitHandler,
  { readonly registerHandler: (handler: ExitHandler) => Effect.Effect<void> }
>()(
  '@systemfsoftware/stryker-js-mutation-run/UnexpectedExitHandler',
) {}

export const makeUnexpectedExitHandlerLayer = (
  process: Pick<NodeJS.Process, 'on' | 'off'>,
): Layer.Layer<UnexpectedExitHandler> =>
  Layer.effect(
    UnexpectedExitHandler,
    Effect.gen(function*() {
      const handlers: ExitHandler[] = []
      const handleExit = () => {
        for (const handler of handlers) handler()
      }
      process.on('exit', handleExit)
      yield* Effect.addFinalizer(() => Effect.sync(() => process.off('exit', handleExit)))
      return {
        registerHandler: (handler: ExitHandler) => Effect.sync(() => handlers.push(handler)).pipe(Effect.asVoid),
      }
    }),
  )
