import { Cell } from '@systemfsoftware/effect-cell-types'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MutantId } from '@systemfsoftware/stryker-js/Mutant'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
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
        return new OrderRequest({ id: S.decodeSync(MutantId)(`after-${answered}`) })
      }),
  })
  const second = Cell.layer({
    read: (request: OrderRequest) =>
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
    const chained = pipe(orders.first, Cell.andThen(orders.second))
    const firstResponse = yield* Cell.run(chained, new OrderRequest({ id: S.decodeSync(MutantId)('initial-request') }))
    return { firstResponse, recorded: orders.recorded, trace: orders.trace }
  })

interface SingleOrder {
  readonly cell: Cell.Cell<OrderRequest, OrderRequest, OrderRefused, never>
  readonly trace: string[]
}

const describeSingleOrder = (): SingleOrder => {
  const trace: string[] = []
  const cell = Cell.layer({
    read: (request: OrderRequest) =>
      Effect.sync(() => {
        trace.push('single order read its request')
        return request
      }),
    decide: admitOrder,
    write: (output: Result.Result<OrderDecision, OrderRefused>, _raw: OrderRequest) =>
      Result.match(output, {
        onSuccess: (decision) =>
          Effect.sync(() => {
            trace.push('single order wrote its answer')
            const answered = Match.value(decision).pipe(
              Match.tag('OrderAdmitted', (admitted) => `after-admitted:${admitted.id}`),
              Match.tag('OrderRejected', (rejected) => `after-rejected:${rejected.why}:${rejected.id}`),
              Match.exhaustive,
            )
            return new OrderRequest({ id: S.decodeSync(MutantId)(answered) })
          }),
        onFailure: (refused) => Effect.fail(refused),
      }),
  })
  return { cell, trace }
}

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
          expect(s.outcome.firstResponse).toStrictEqual(
            new OrderRequest({ id: S.decodeSync(MutantId)('after-initial-request') }),
          )
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
    scenario(
      'a too-short id observes its rejection in the ledger',
      Gherkin.Do.pipe(
        Given('a single order is described')(
          'order',
          () => Effect.succeed(describeSingleOrder()),
        ),
        When("the order runs with id 'ab'")(
          'outcome',
          (s) => Cell.run(s.order.cell, new OrderRequest({ id: S.decodeSync(MutantId)('ab') })),
        ),
        Then('the response carries the rejection in the ledger')((s) => {
          expect(s.outcome).toStrictEqual(
            new OrderRequest({ id: S.decodeSync(MutantId)('after-rejected:too short:ab') }),
          )
        }),
        Then('the order ran its steps in the order it declares')((s) => {
          expect(s.order.trace).toStrictEqual([
            'single order read its request',
            'single order wrote its answer',
          ])
        }),
      ),
    )
    scenario(
      'an empty id is refused at the order boundary',
      Gherkin.Do.pipe(
        Given('a single order is described')(
          'order',
          () => Effect.succeed(describeSingleOrder()),
        ),
        When('the empty id is decoded against the order request')(
          'admitted',
          () => Effect.succeed(Result.isSuccess(S.decodeUnknownResult(OrderRequest)({ _tag: 'OrderRequest', id: '' }))),
        ),
        Then('the boundary refuses it')((s) => {
          expect(s.admitted).toBe(false)
        }),
        Then('the refusal never reached the write')((s) => {
          expect(s.order.trace).toStrictEqual([])
        }),
      ),
    )
  })
