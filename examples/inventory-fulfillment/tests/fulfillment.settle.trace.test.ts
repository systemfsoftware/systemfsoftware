import { it } from '@effect/vitest'
import { Suite } from '@systemfsoftware/trace-spec'
import {
  allocateContract,
  creditHoldContract,
  settlementLayers,
  settlementRequest,
} from './__fixtures__/fulfillment-trace.fixture.js'

const Trace = Suite.make({ it })

const world = settlementLayers({
  creditLimits: { 'customer-in-good-standing': 1000, 'customer-without-credit': 0 },
  commitOutcomes: {},
})

Trace('inventory.fulfillment')
  .withScenarioLayer(world)
  .body(({ Case }) => {
    Case(
      'an allocated settlement commits its reservation and charges credit',
      allocateContract,
      settlementRequest('order-1', 'customer-in-good-standing'),
    )
    Case(
      'a held settlement commits its reservation without charging credit',
      creditHoldContract,
      settlementRequest('order-2', 'customer-without-credit'),
    )
  })
