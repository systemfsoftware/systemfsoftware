/**
 * The runtime half of the `effect/TestClock` compat path. Tests that write the Effect v3 module path resolve
 * here, and on virtual time the only clock move an author can ask for is letting that much time pass.
 *
 * @since 4.0.0
 */
import type * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'

export const adjust = (duration: Duration.Input): Effect.Effect<void> => Effect.sleep(duration)
