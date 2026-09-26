import { Conformance } from '@systemfsoftware/conformance-spec'
import { Effect } from 'effect'

/**
 * A rule check reports why the unit broke its rule in plain words, or nothing
 * when it held; this turns that into the failure the stop check judges.
 */
export const ruleFrom = (message: string | undefined): Effect.Effect<void, Conformance.RuleBroken> =>
  message === undefined ? Effect.void : Effect.fail(Conformance.RuleBroken.make({ message }))
