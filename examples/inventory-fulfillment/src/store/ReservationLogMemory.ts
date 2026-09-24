import { Array as Arr, Effect, HashMap, Layer, Option, Ref } from 'effect'
import { StoreUnavailable } from '../fulfillment/decision.schema.js'
import { ReservationLog, type ReservationLogService, type ReservationRecord } from '../ports/ReservationLog.service.js'
import { decodeLotAllocation } from './decode.js'

export interface ReservationLogSeed {
  readonly reservations: readonly ReservationRecord[]
}

interface MemoryState {
  readonly reservations: HashMap.HashMap<string, ReservationRecord>
}

const initialStateOf = (seed: ReservationLogSeed): MemoryState => ({
  reservations: HashMap.fromIterable(
    Arr.map(seed.reservations, (reservation) => [reservation.orderId, reservation] as const),
  ),
})

const findReservation = (state: Ref.Ref<MemoryState>, orderId: string) =>
  Effect.gen(function*() {
    const current = yield* Ref.get(state)
    return yield* Option.match(HashMap.get(current.reservations, orderId), {
      onNone: () => Effect.succeed(Option.none<ReservationRecord>()),
      onSome: (reservation) =>
        Effect.gen(function*() {
          const allocations = yield* Effect.forEach(
            reservation.allocations,
            (allocation) => decodeLotAllocation(allocation),
          )
          return Option.some<ReservationRecord>({
            orderId: reservation.orderId,
            customerId: reservation.customerId,
            allocations,
            occurredAt: reservation.occurredAt,
          })
        }),
    })
  }).pipe(Effect.mapError((cause) => new StoreUnavailable({ cause })))

const make = (seed: ReservationLogSeed): Effect.Effect<ReservationLogService> =>
  Effect.gen(function*() {
    const state = yield* Ref.make(initialStateOf(seed))
    return {
      findReservation: (orderId: string) => findReservation(state, orderId),
    }
  })

export const layer = (seed: ReservationLogSeed): Layer.Layer<ReservationLog> => Layer.effect(ReservationLog, make(seed))
