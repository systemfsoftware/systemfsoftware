import { Effect } from 'effect'
import { wrapError } from './errors.js'

/**
 * Wraps a promise-returning method bound to a Playwright object as an `Effect`,
 * mapping any rejection through {@link wrapError}.
 */
export const useHelper = <Wrap>(api: Wrap) => <A>(userFunction: (api: Wrap) => Promise<A>) =>
  Effect.tryPromise({ try: () => userFunction(api), catch: wrapError })

/**
 * Widens an omitted argument to the required slot Playwright's evaluated-function
 * overload declares; the runtime accepts the argument being absent.
 */
export function assertEvaluateArg<Arg>(_value: Arg | undefined): asserts _value is Arg {}
