import { Effect, type Scope } from 'effect'
import { errors } from 'playwright-core'
import { type PlaywrightError, PlaywrightFailure, PlaywrightTimeout } from './errors.schema.js'

const messageOf = <E>(error: E): string =>
  error instanceof Error ? error.message : 'Playwright rejected with a value that is not an Error'

const toPlaywrightError = <E>(error: E): PlaywrightError =>
  error instanceof errors.TimeoutError
    ? new PlaywrightTimeout({ message: error.message, cause: error })
    : new PlaywrightFailure({ message: messageOf(error), cause: error })

export const attempt = <A>(run: () => Promise<A>): Effect.Effect<A, PlaywrightError> =>
  Effect.tryPromise({ try: run, catch: toPlaywrightError })

export const acquire = <A extends AsyncDisposable>(
  open: () => Promise<A>,
): Effect.Effect<A, PlaywrightError, Scope.Scope> =>
  Effect.acquireRelease(
    attempt(open),
    (resource) => attempt(() => Promise.resolve(resource[Symbol.asyncDispose]())).pipe(Effect.ignore({ log: true })),
  )
