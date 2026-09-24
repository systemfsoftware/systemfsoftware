import { it } from '@effect/vitest'
import { Suite } from '@systemfsoftware/trace-spec'
import {
  allocateContract,
  creditHoldContract,
  placeOrderRequest,
  retriedSettlementContract,
  settlementLayers,
} from './__fixtures__/fulfillment-trace.fixture.js'

const Trace = Suite.make({ it })

const world = settlementLayers

Trace('inventory.fulfillment')
  .withScenarioLayer(world)
  .live('each case runs the order through in-process PGlite, whose file reads the simulation kernel cannot observe')
  .body(({ Case }) => {
    Case(
      'an allocated order commits its reservation and charges credit',
      allocateContract,
      placeOrderRequest('order-1', 'customer-in-good-standing'),
    )
    Case(
      'a held order commits its audit row without charging credit',
      creditHoldContract,
      placeOrderRequest('order-2', 'customer-without-credit'),
    )
    Case(
      'an order whose first commit attempt fails is retried and commits once',
      retriedSettlementContract,
      placeOrderRequest('order-3', 'customer-in-good-standing'),
    )
  })
