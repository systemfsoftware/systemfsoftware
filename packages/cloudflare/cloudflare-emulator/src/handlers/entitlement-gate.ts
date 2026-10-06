import { Function, Match } from 'effect'
import * as Result from 'effect/Result'
import { failureEnvelope } from '../cloudflare-envelope.schema.js'
import type { Settled } from '../settle-operation.js'
import type { EmulatorState } from '../state/emulator-state.js'
import { EntitlementCommand } from '../state/entitlement.schema.js'
import type { GateProduct } from '../state/entitlement.schema.js'
import { judgeEntitlement } from '../state/judge-entitlement.workflow.js'

export interface EntitlementGateOptions<S> {
  readonly product: GateProduct
  readonly state: EmulatorState
  readonly unchanged: S
}

const gate = <S>(run: () => Settled<S>, options: EntitlementGateOptions<S>): Settled<S> =>
  Match.value(
    Result.getOrThrow(judgeEntitlement(EntitlementCommand.make({
      product: options.product,
      seeds: options.state.entitlements,
    }))),
  ).pipe(
    Match.tags({
      Entitled: () => run(),
      AccessPending: (pending): Settled<S> => ({
        body: failureEnvelope({ code: pending.code, message: pending.message }),
        product: options.unchanged,
        status: 400,
      }),
    }),
    Match.exhaustive,
  )

export const entitlementGate: {
  <S>(options: EntitlementGateOptions<S>): (run: () => Settled<S>) => Settled<S>
  <S>(run: () => Settled<S>, options: EntitlementGateOptions<S>): Settled<S>
} = Function.dual(2, gate)
