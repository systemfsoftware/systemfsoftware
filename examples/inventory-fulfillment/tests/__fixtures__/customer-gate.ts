import { Conformance } from '@systemfsoftware/conformance-spec'
import { CustomerGate } from '@systemfsoftware/example-inventory-fulfillment'
import { Context, Data, Effect, HashMap, Layer, Match, Option, Ref } from 'effect'
import type { GateCommand, GateResponse } from './customer-gate.model.js'

class Occupancy extends Context.Service<Occupancy, Ref.Ref<HashMap.HashMap<string, number>>>()(
  '@systemfsoftware/example-inventory-fulfillment/test/Occupancy',
) {}

export const gateLayer: Layer.Layer<CustomerGate | Occupancy> = Layer.mergeAll(
  CustomerGate.Live,
  Layer.effect(Occupancy, Ref.make(HashMap.empty<string, number>())),
)

const placeOrder = (customer: string) =>
  Effect.gen(function*() {
    const occupancy = yield* Occupancy
    const before = yield* Ref.get(occupancy)
    const inside = Option.getOrElse(HashMap.get(before, customer), () => 0)
    yield* Ref.update(occupancy, (counts) => HashMap.set(counts, customer, inside + 1))
    yield* Effect.yieldNow
    yield* Ref.update(occupancy, (counts) => HashMap.set(counts, customer, inside))
    return inside
  })

export const gateResponse = (
  command: GateCommand,
): Effect.Effect<GateResponse, never, CustomerGate | Occupancy> =>
  Effect.gen(function*() {
    const gate = yield* CustomerGate
    return yield* gate.withGate(command.customer, placeOrder(command.customer))
  })

export class CheckRejected extends Data.TaggedError('CheckRejected')<{ readonly report: string }> {}

export const passedHistories = <C, R>(report: Conformance.Report<C, R>): number =>
  Match.value(report).pipe(
    Match.tag('Pass', (passed) => passed.histories),
    Match.orElse(() => {
      throw new CheckRejected({ report: Conformance.render(report) })
    }),
  )
