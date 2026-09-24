import { expect, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'

const sideEffect = Effect.die('SIDE EFFECT RAN')

const first = (): number => 1
const second = (): number => 2

it.effect('Should_ReportBothFailures_When_TwoChecksFailInOneStep', () =>
  Effect.gen(function*() {
    expect(first()).toEqual(3)
    expect(second()).toEqual(4)
    return yield* sideEffect
  }))
