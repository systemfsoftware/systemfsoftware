import { Effect, Layer, Match } from 'effect'
import { Rpc } from 'effect/rpc'
import * as Contract from '../../Contract/mod.js'
import { type Capabilities, type ContractRpc, groupOf, type Invocation } from './group.js'

export type CapabilityHandler<R = never> = (
  invocation: Invocation,
) => Effect.Effect<
  Contract.Completed | Contract.Accepted,
  Contract.Refused | Contract.Rejected | Contract.Unavailable,
  R
>

const handleOf = <R>(capability: Contract.Capability<Contract.Any, R>): CapabilityHandler<R> => (invocation) =>
  Effect.flatMap(capability.cell.run(invocation), (answer) =>
    Match.value(answer).pipe(
      Match.tag('Completed', (completed) => Effect.succeed<Contract.Completed | Contract.Accepted>(completed)),
      Match.tag('Accepted', (accepted) => Effect.succeed<Contract.Completed | Contract.Accepted>(accepted)),
      Match.tag(
        'Refused',
        (refused) => Effect.fail<Contract.Refused | Contract.Rejected | Contract.Unavailable>(refused),
      ),
      Match.tag(
        'Rejected',
        (rejected) => Effect.fail<Contract.Refused | Contract.Rejected | Contract.Unavailable>(rejected),
      ),
      Match.exhaustive,
    ))

export const handlersOf = <R>(registry: Capabilities<R>): Record<string, CapabilityHandler<R>> =>
  Object.fromEntries(
    Object.entries(registry).map(([name, capability]): readonly [string, CapabilityHandler<R>] => [
      name,
      handleOf(capability),
    ]),
  )

export const layerOf = <R>(registry: Capabilities<R>): Layer.Layer<Rpc.ToHandler<ContractRpc>, never, R> =>
  groupOf(registry).toLayer(handlersOf(registry))
