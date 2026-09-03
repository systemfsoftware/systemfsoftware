import { Cell } from '@systemfsoftware/effect-cell-types'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Result from 'effect/Result'
import { expect } from 'vitest'
import { admitOrder, type OrderDecision, OrderRefused, OrderRequest } from './__fixtures__/admit-order.workflow.js'

interface OrderPair {
  readonly first: Cell.Cell<OrderRequest, OrderRequest, never, never>
  readonly second: Cell.Cell<OrderRequest, OrderRequest, never, never>
  readonly trace: string[]
  readonly recorded: { secondReadRaw?: OrderRequest; secondWriteRaw?: OrderRequest }
}

const describeOrders = (): OrderPair => {
  const trace: string[] = []
  const recorded: { secondReadRaw?: OrderRequest; secondWriteRaw?: OrderRequest } = {}
  const first = Cell.layer({
    read: (request: OrderRequest) =>
      // raw: OrderRequest from OrderRequest
      Effect.sync(() => {
        trace.push('first order read its request')
        return request
      }),
    decide: admitOrder,
    write: (output: Result.Result<OrderDecision, OrderRefused>, _raw: OrderRequest) =>
      Effect.sync(() => {
        trace.push('first order wrote its answer')
        const answered = Result.match(output, {
          onSuccess: (admitted) => admitted.id,
          onFailure: (refused) => refused.id,
        })
        return new OrderRequest({ id: `after-${answered}` })
      }),
  })
  const second = Cell.layer({
    read: (request: OrderRequest) =>
      // raw: OrderRequest from OrderRequest
      Effect.sync(() => {
        trace.push('second order read its request')
        recorded.secondReadRaw = request
        return request
      }),
    decide: admitOrder,
    write: (output: Result.Result<OrderDecision, OrderRefused>, raw: OrderRequest) =>
      Effect.sync(() => {
        trace.push('second order wrote its answer')
        recorded.secondWriteRaw = raw
        return raw
      }),
  })
  return { first, second, trace, recorded }
}

const runBoth = (orders: OrderPair) =>
  Effect.gen(function*() {
    const firstResponse = yield* Cell.run(orders.first, new OrderRequest({ id: 'initial-request' }))
    yield* Cell.run(orders.second, firstResponse)
    return { firstResponse, recorded: orders.recorded, trace: orders.trace }
  })

const Feature = makeFeature({ it, layer })

Feature('Chaining two orders through the caller')
  .body(({ scenario }) => {
    scenario(
      'the second order starts from what the first order answered',
      Gherkin.Do.pipe(
        Given('two orders are described, the second to run after the first')(
          'orders',
          () => Effect.succeed(describeOrders()),
        ),
        When('the first order runs and its answer becomes the request of the second')(
          'outcome',
          (s) => runBoth(s.orders),
        ),
        Then('the second order read exactly the answer the first produced')((s) => {
          expect(s.outcome.recorded.secondReadRaw).toStrictEqual(s.outcome.firstResponse)
        }),
        Then('both orders ran their steps in the order each declares')((s) => {
          expect(s.outcome.trace).toStrictEqual([
            'first order read its request',
            'first order wrote its answer',
            'second order read its request',
            'second order wrote its answer',
          ])
        }),
        Then('the write of the second order saw the answer as the value it read')((s) => {
          expect(s.outcome.recorded.secondWriteRaw).toStrictEqual(s.outcome.firstResponse)
        }),
      ),
    )
  })
