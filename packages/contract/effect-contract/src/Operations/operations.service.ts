import { Context, type Effect, PlatformError, type Stream } from 'effect'
import type { Principal } from '../Principal/principal.schema.js'
import type {
  AlreadySettled,
  OperationNotFound,
  OperationState,
  Settled,
  SettlementAnswer,
} from './operation-state.schema.js'
import type { OperationId } from './operation.schema.js'

export interface OperationsShape {
  readonly begin: (owner: Principal) => Effect.Effect<OperationId, PlatformError.PlatformError>
  readonly settle: (
    id: OperationId,
    answer: SettlementAnswer,
  ) => Effect.Effect<Settled, AlreadySettled | OperationNotFound>
  readonly get: (id: OperationId) => Effect.Effect<OperationState, OperationNotFound>
  readonly watch: (id: OperationId) => Stream.Stream<OperationState, OperationNotFound>
}

export class Operations extends Context.Service<Operations, OperationsShape>()(
  '@systemfsoftware/effect-contract/Operations',
) {}
