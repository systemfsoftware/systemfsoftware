import { describe, it } from '@systemfsoftware/vitest'
import { expect as rawExpect } from 'vitest'

const total = (quantities: ReadonlyArray<number>): number => quantities.reduce((sum, each) => sum + each, 0)

describe('an expect imported from vitest', () => {
  it('Should_RefuseTheRawExpect_When_AnImportedExpectRunsBesideARealCheck', function*({ expect }) {
    yield* expect(total([1, 2])).toEqual(3)
    rawExpect(total([1, 2])).toEqual(3)
  })
})
