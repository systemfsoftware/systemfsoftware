import { Schema } from 'effect'
import { Rpc, RpcGroup } from 'effect/rpc'
import * as Contract from '../../Contract/mod.js'
import * as Operations from '../../Operations/mod.js'
import * as Principal from '../../Principal/mod.js'

const payloadSchema = () => Schema.Struct({ input: Schema.Json, principal: Principal.Principal })
type PayloadSchema = ReturnType<typeof payloadSchema>

export type Invocation = PayloadSchema['Type']

const nextActionsOf = (links: ReadonlyArray<string>) =>
  Schema.Struct({
    operation: links.length === 0 ? Schema.Never : Schema.Literals(links),
    input: Schema.JsonObject,
  })

const refusedOf = (contract: Contract.Any) =>
  Schema.TaggedStruct('Refused', {
    refusal: contract.refusals,
    next: Schema.Array(nextActionsOf(contract.links)),
  })

const acceptedOf = (contract: Contract.Any) =>
  Schema.TaggedStruct('Accepted', {
    operation: Operations.OperationId,
    next: Schema.Array(nextActionsOf(contract.links)),
  })

const isDurable = (contract: Contract.Any): boolean => Schema.is(Contract.DurableWrite)(contract.access)

const successOf = (contract: Contract.Any) =>
  isDurable(contract) ? Schema.Union([contract.completed, acceptedOf(contract)]) : contract.completed

const failureOf = (contract: Contract.Any) =>
  Schema.Union([refusedOf(contract), Contract.Rejected, Contract.Unavailable])

const rpcOf = (name: string, contract: Contract.Any) =>
  Rpc.make(name, {
    payload: payloadSchema(),
    success: successOf(contract),
    error: failureOf(contract),
  })

export type ContractRpc = ReturnType<typeof rpcOf>

export type Capabilities<R = never> = Readonly<Record<string, Contract.Capability<Contract.Any, R>>>

export const groupOf = <R>(registry: Capabilities<R>): RpcGroup.RpcGroup<ContractRpc> =>
  RpcGroup.make(...Object.entries(registry).map(([name, capability]) => rpcOf(name, capability.contract)))
