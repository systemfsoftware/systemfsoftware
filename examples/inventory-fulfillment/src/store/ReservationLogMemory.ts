import { Array as Arr, Effect, HashMap, Layer, Option, Ref } from 'effect'
import { StoreUnavailable } from '../fulfillment/decision.schema.js'
import type { AuditPayload } from '../fulfillment/event.schema.js'
import { ReservationLog, type ReservationLogService, type ReservationRecord } from '../ports/ReservationLog.service.js'
import { decodeLotAllocation } from './decode.js'

export interface ReservationLogSeed {
  readonly reservations: readonly ReservationRecord[]
}

interface MemoryState {
  readonly reservations: HashMap.HashMap<string, ReservationRecord>
  readonly rollbacks: HashMap.HashMap<string, AuditPayload>
}

const rollbackIdOf = (audit: AuditPayload): string => `${audit.orderId}:rollback`

const initialStateOf = (seed: ReservationLogSeed): MemoryState => ({
  reservations: HashMap.fromIterable(
    Arr.map(seed.reservations, (reservation) => [reservation.orderId, reservation] as const),
  ),
  rollbacks: HashMap.empty(),
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

const appendRollback = (state: Ref.Ref<MemoryState>, audit: AuditPayload): Effect.Effect<void> =>
  Ref.update(state, (current) => {
    const rollbackId = rollbackIdOf(audit)
    if (HashMap.has(current.rollbacks, rollbackId)) return current
    return { ...current, rollbacks: HashMap.set(current.rollbacks, rollbackId, audit) }
  })

const make = (seed: ReservationLogSeed): Effect.Effect<ReservationLogService> =>
  Effect.gen(function*() {
    const state = yield* Ref.make(initialStateOf(seed))
    return {
      findReservation: (orderId: string) => findReservation(state, orderId),
      appendRollback: (audit: AuditPayload) => appendRollback(state, audit),
    }
  })

export const layer = (seed: ReservationLogSeed): Layer.Layer<ReservationLog> => Layer.effect(ReservationLog, make(seed))
