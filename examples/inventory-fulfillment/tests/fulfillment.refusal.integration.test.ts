import { it } from '@effect/vitest'
import { Fulfillment } from '@systemfsoftware/example-inventory-fulfillment'
import { Contract } from '@systemfsoftware/trace-spec'
import { Effect } from 'effect'
import { describe, expect } from 'vitest'
import {
  allocateContract,
  disparityOf,
  placeOrderRequest,
  settlementLayers,
} from './__fixtures__/fulfillment-trace.fixture.js'

describe('Refusing an order whose trace breaks the written contract', () => {
  it.effect('a held order held to the contract that requires the charge names the charge', () =>
    Effect.gen(function*() {
      const refusal = yield* Effect.flip(
        Contract.check(allocateContract, placeOrderRequest('held-order', 'customer-without-credit')),
      )
      const disparity = disparityOf(refusal)
      expect(disparity.breaks.map((entry) => entry.conjunct)).toContain(
        `unique(${Fulfillment.Taxonomy.CreditCharge.id})`,
      )
    }).pipe(Effect.provide(settlementLayers)))
})
