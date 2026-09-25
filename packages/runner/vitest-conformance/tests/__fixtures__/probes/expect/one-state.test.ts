import { describe, it } from '@systemfsoftware/vitest'
import { Effect } from 'effect'
import { TestClock } from 'effect/testing'

interface Order {
  readonly id: number
  readonly status: 'Pending' | 'Shipped'
}

const pending: Order = { id: 1, status: 'Pending' }

describe('one check per observed state', () => {
  it('Should_RefuseTheSecondCheck_When_TwoChecksObserveOneState', function*({ expect }) {
    yield* expect(pending.id).toEqual(1)
    yield* expect(pending.status).toEqual('Pending')
  })

  it('Should_AcceptTheSecondCheck_When_StepSeparatesStates', function*({ expect }) {
    yield* expect(pending.id).toEqual(1)
    yield* TestClock.adjust('3 seconds')
    yield* expect(pending.status).toEqual('Pending')
  })

  it('Should_RefuseTheCheckInALoop_When_EachItemOfTheSameStateChecksItself', function*({ expect }) {
    const quantities = yield* Effect.forEach([1, 2], (quantity) => Effect.succeed(quantity))
    yield* expect(quantities).toEqual([1, 2])
    yield* Effect.forEach(quantities, (quantity) => expect(quantity).toBeGreaterThan(0))
  })
})
