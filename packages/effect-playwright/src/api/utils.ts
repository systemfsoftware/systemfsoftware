import { Effect } from 'effect'
import type { PlaywrightError } from './errors.js'
import { wrapError } from './errors.js'

export const useHelper: <Wrap>(
  api: Wrap,
) => <A>(userFunction: (api: Wrap) => Promise<A>) => Effect.Effect<A, PlaywrightError> =
  <Wrap>(api: Wrap) => <A>(userFunction: (api: Wrap) => Promise<A>) =>
    Effect.tryPromise(() => userFunction(api)).pipe(Effect.mapError(wrapError))
