import { expect, layer } from '@effect/vitest'
import { Effect, Layer } from 'effect'

const started: Array<string> = []

const firstRunOrder = (labels: ReadonlyArray<string>): ReadonlyArray<string> =>
  labels.filter((label, index) => labels.indexOf(label) === index)

const atSlot = (label: string, slot: number): Effect.Effect<void> =>
  Effect.sync(() => {
    started.push(label)
    expect(firstRunOrder(started).indexOf(label)).toEqual(slot)
  })

layer(Layer.empty, { concurrent: false })('a layer block shuffles by default', (it) => {
  it.effect('T_One', () => atSlot('one', 1))
  it.effect('T_Two', () => atSlot('two', 0))
  it.effect('T_Three', () => atSlot('three', 2))
})
