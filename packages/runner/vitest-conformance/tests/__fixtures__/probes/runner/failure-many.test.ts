import { it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const observed = (which: string): string => `${which}-actual`

const crashOnCleanup = (): Effect.Effect<never> => Effect.die(new Error('unthrown-marker'))

it('Should_FailWithTwoErrors_When_ItsCheckMismatchesAndItsCleanupFails', function*({ expect }) {
  yield* expect(observed('kept')).toEqual('kept-expected').pipe(Effect.ensuring(crashOnCleanup()))
})
