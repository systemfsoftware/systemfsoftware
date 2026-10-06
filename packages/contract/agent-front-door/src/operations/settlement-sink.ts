import type { Operations } from '@systemfsoftware/effect-contract'

export type SettlementSink = (
  settled: Operations.Settled,
  operation: Operations.OperationId,
) => Promise<void> | void

export interface SettlementDispatch {
  readonly sinks: ReadonlyArray<SettlementSink>
  readonly operation: Operations.OperationId
  readonly settled: Operations.Settled
  readonly waitUntil: (promise: Promise<void>) => void
}

export const runSettlementSinks = ({ sinks, operation, settled, waitUntil }: SettlementDispatch): void => {
  for (const sink of sinks) {
    waitUntil(Promise.resolve().then(() => sink(settled, operation)).then(() => undefined, () => undefined))
  }
}
