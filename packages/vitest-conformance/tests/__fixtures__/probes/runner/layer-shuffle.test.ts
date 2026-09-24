import { layer } from '@systemfsoftware/vitest'
import { Layer } from 'effect'

const started: Array<string> = []

const firstRunOrder = (labels: ReadonlyArray<string>): ReadonlyArray<string> =>
  labels.filter((label, index) => labels.indexOf(label) === index)

layer(Layer.empty, { concurrent: false })('a layer block shuffles by default', (it) => {
  it('Should_LandInItsSeededSlot_When_One', function*({ expect }) {
    started.push('one')
    yield* expect(firstRunOrder(started).indexOf('one')).toEqual(1)
  })

  it('Should_LandInItsSeededSlot_When_Two', function*({ expect }) {
    started.push('two')
    yield* expect(firstRunOrder(started).indexOf('two')).toEqual(0)
  })

  it('Should_LandInItsSeededSlot_When_Three', function*({ expect }) {
    started.push('three')
    yield* expect(firstRunOrder(started).indexOf('three')).toEqual(2)
  })
})
