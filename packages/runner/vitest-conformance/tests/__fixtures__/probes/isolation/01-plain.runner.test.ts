import { it } from '@systemfsoftware/vitest'

const doubled = (value: number): number => value * 2

it('Should_Pass_When_TheFileHasNoProperty', function*({ expect }) {
  yield* expect(doubled(2)).toBe(4)
})
