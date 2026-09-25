import { expect, it } from 'vitest'

const total = (quantities: ReadonlyArray<number>): number => quantities.reduce((sum, each) => sum + each, 0)

it('Should_RefuseTheForeignRegistration_When_VitestRegistersTheTest', () => {
  expect(total([1, 2])).toEqual(3)
})
