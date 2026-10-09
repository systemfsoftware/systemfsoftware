import { it } from '@systemfsoftware/vitest'
import { expect } from 'vitest'

const total = (quantities: ReadonlyArray<number>): number => quantities.reduce((sum, each) => sum + each, 0)

// @ts-expect-error ✗ the body must be a generator that yields its checks: it(name, function* ({ expect }) { const x = yield* program; yield* expect(x).toEqual(expected) }).
it('Should_RefuseTheSyncBody_When_BodyIsNotAGenerator', () => {
  expect(total([1, 2])).toEqual(3)
})
