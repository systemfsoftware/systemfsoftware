import { it } from '@systemfsoftware/vitest'

const observed = (which: string): string => `${which}-actual`

it('Should_FailWithOneError_When_ItsOnlyCheckMismatches', function*({ expect }) {
  yield* expect(observed('solo')).toEqual('solo-expected')
})
