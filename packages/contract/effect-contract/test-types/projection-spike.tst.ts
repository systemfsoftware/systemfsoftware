import { Cell } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, type Effect, Schema } from 'effect'
import { Tool, Toolkit } from 'effect/ai'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'
import { Rpc, RpcGroup } from 'effect/rpc'
import { describe, expect, it } from 'tstyche'
import { Contract } from '../src/mod.js'
import { Operations } from '../src/Operations/operations.service.js'

class InsufficientFunds extends Schema.TaggedClass<InsufficientFunds>()('InsufficientFunds', {
  shortBy: Schema.Finite,
}) {}
class AccountFrozen extends Schema.TaggedClass<AccountFrozen>()('AccountFrozen', {}) {}

const transfer = Contract.make({
  name: 'transfer',
  description: 'Moves an amount between two accounts.',
  input: Schema.Struct({ from: Schema.String, to: Schema.String, amount: Schema.Finite }),
  output: Schema.Struct({ transferId: Schema.String }),
  refusals: Schema.Union([InsufficientFunds, AccountFrozen]),
  access: new Contract.Write({ risk: 'ContainedWrite' }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: ['getBalance'],
})

const getBalance = Contract.make({
  name: 'getBalance',
  description: 'Reads an account balance.',
  input: Schema.Struct({ account: Schema.String }),
  output: Schema.Struct({ cents: Schema.Finite }),
  refusals: Schema.Never,
  access: new Contract.Read({ cache: new Contract.Fresh({ maxAgeSeconds: 60 }) }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

const hold = Contract.durable({
  name: 'hold',
  description: 'Holds a seat until it is confirmed or expires.',
  input: Schema.Struct({ ttlMs: Schema.Finite }),
  output: Schema.Struct({ outcome: Schema.Literals(['confirmed', 'expired']) }),
  refusals: Schema.Never,
  access: new Contract.DurableWrite({ risk: 'MinimalImpact' }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

const rejecting = Cell.succeed({ _tag: 'Rejected', issue: 'spike' } as const)
const completing = Cell.succeed({ _tag: 'Completed', output: { cents: 1 }, next: [] } as const)

const transferCapability = Contract.implement(transfer, rejecting)
const getBalanceCapability = Contract.implement(getBalance, rejecting)
const holdCapability = Contract.implement(hold, rejecting)

const registry = Contract.registry({
  transfer: transferCapability,
  getBalance: getBalanceCapability,
  hold: holdCapability,
})

const endpointOf = (capability: { readonly contract: Contract.Any }) =>
  HttpApiEndpoint.post(capability.contract.name, `/${capability.contract.name}`, {
    payload: capability.contract.input,
    success: capability.contract.answer,
  })

const rpcOf = (capability: { readonly contract: Contract.Any }) =>
  Rpc.make(capability.contract.name, {
    payload: capability.contract.input,
    success: capability.contract.answer,
    error: Contract.Unavailable,
  })

const toolOf = (capability: { readonly contract: Contract.Any }) =>
  Tool.make(capability.contract.name, {
    description: capability.contract.description,
    parameters: capability.contract.input,
    success: capability.contract.answer,
  })

type Endpoint = HttpApiEndpoint.HttpApiEndpoint<
  string,
  'POST',
  `/${string}`,
  never,
  never,
  Schema.toCodecJson<Contract.InputSchema>,
  never,
  Schema.toCodecJson<Contract.AnswerSchema>
>
type CapabilityRpc = Rpc.Rpc<string, Contract.InputSchema, Contract.AnswerSchema, typeof Contract.Unavailable>
type CapabilityTool = Tool.Tool<
  string,
  {
    readonly parameters: Contract.InputSchema
    readonly success: Contract.AnswerSchema
    readonly failure: typeof Schema.Never
    readonly failureMode: 'error'
  }
>

type RunOf<C extends Contract.Any> = Effect.Effect<C['answer']['Type'], Contract.Unavailable, never>
type RunOfGetOperation = Effect.Effect<Contract.Answer, Contract.Unavailable, Operations>
type NextToBalance = ReadonlyArray<{ readonly operation: 'getBalance'; readonly input: Schema.JsonObject }>
type NextToNothing = ReadonlyArray<{ readonly operation: never; readonly input: Schema.JsonObject }>

declare const call: <C extends Contract.Any>(
  contract: C,
  input: C['input']['Type'],
) => Effect.Effect<C['answer']['Type'], Contract.Unavailable, never>

describe('Contract.registry', () => {
  it('folds every capability into an HttpApi group with no assertion', () => {
    expect(
      Arr.match(Arr.map(Object.values(registry), endpointOf), {
        onEmpty: () => HttpApiGroup.make('capabilities'),
        onNonEmpty: (endpoints) => HttpApiGroup.make('capabilities').add(...endpoints),
      }),
    ).type.toBe<
      | HttpApiGroup.HttpApiGroup<'capabilities', never, false>
      | HttpApiGroup.HttpApiGroup<'capabilities', Endpoint, false>
    >()
  })

  it('folds every capability into an RpcGroup whose handlers run the capability cell', () => {
    const rpcGroup = RpcGroup.make(...Arr.map(Object.values(registry), rpcOf))
    expect(rpcGroup).type.toBe<RpcGroup.RpcGroup<CapabilityRpc>>()
    rpcGroup.of(
      Object.fromEntries(
        Arr.map(Object.values(registry), (capability) => [
          capability.contract.name,
          (payload: object) => {
            expect(payload).type.toBe<object>()
            const encode = Schema.encodeUnknownEffect(Schema.toCodecJson(capability.contract.input))
            expect(encode(payload)).type.toBe<Effect.Effect<Schema.Json, Schema.SchemaError, never>>()
            return capability.cell.run({ input: [], principal: new Contract.Anonymous({}) })
          },
        ]),
      ),
    )
  })

  it('folds every capability into a Toolkit with no assertion', () => {
    expect(Toolkit.make(...Arr.map(Object.values(registry), toolOf))).type.toBe<
      Toolkit.Toolkit<{ readonly [name: string]: CapabilityTool }>
    >()
  })

  it('accepts a key equal to its contract name and refuses one naming another contract', () => {
    expect(Contract.registry).type.toBeCallableWith({ transfer: transferCapability, getBalance: getBalanceCapability })
    expect(Contract.registry).type.not.toBeCallableWith({
      getBalance: transferCapability,
      transfer: transferCapability,
    })
  })

  it('refuses a registry where a link names no registered capability', () => {
    expect(Contract.registry).type.toBeCallableWith({ transfer: transferCapability, getBalance: getBalanceCapability })
    expect(Contract.registry).type.not.toBeCallableWith({ transfer: transferCapability })
  })

  it('keeps each registered cell precise per capability', () => {
    expect(registry.getBalance.cell.run({ input: {}, principal: new Contract.Anonymous({}) })).type.toBe<
      RunOf<typeof getBalance>
    >()
    expect(registry.transfer.cell.run({ input: {}, principal: new Contract.Anonymous({}) })).type.toBe<
      RunOf<typeof transfer>
    >()
    expect(registry.hold.cell.run({ input: {}, principal: new Contract.Anonymous({}) })).type.toBe<
      RunOf<typeof hold>
    >()
  })

  it('keeps the built-in read capability with the Operations service in its run type', () => {
    expect(registry.getOperation.cell.run({ input: {}, principal: new Contract.Anonymous({}) })).type.toBe<
      RunOfGetOperation
    >()
  })
})

describe('Contract.implement', () => {
  it('accepts a cell that answers Rejected and refuses one that never does', () => {
    expect(Contract.implement).type.toBeCallableWith(getBalance, rejecting)
    expect(Contract.implement).type.not.toBeCallableWith(getBalance, completing)
  })

  it('refuses a cell whose answer is outside the contract census', () => {
    expect(Contract.implement).type.toBeCallableWith(getBalance, rejecting)
    expect(Contract.implement).type.not.toBeCallableWith(
      transfer,
      Cell.succeed({ _tag: 'Accepted', operation: 'x', next: [] } as const),
    )
  })
})

describe('Contract.make', () => {
  it('keeps the input precise at the call site', () => {
    expect(call).type.toBeCallableWith(transfer, { from: 'a', to: 'b', amount: 1 })
    expect(call).type.not.toBeCallableWith(transfer, { account: 'a' })
  })

  it('refuses a durable write and accepts an immediate one', () => {
    expect(Contract.make).type.toBeCallableWith({ ...transfer, links: [] })
    expect(Contract.make).type.not.toBeCallableWith({ ...hold })
  })

  it('pins the answer of a write to Completed, the declared refusals and Rejected', () => {
    expect<typeof transfer.answer.Type>().type.toBe<
      | {
        readonly _tag: 'Completed'
        readonly output: { readonly transferId: string }
        readonly next: NextToBalance
      }
      | { readonly _tag: 'Refused'; readonly refusal: InsufficientFunds | AccountFrozen; readonly next: NextToBalance }
      | { readonly _tag: 'Rejected'; readonly issue: string }
    >()
  })
})

describe('Contract.durable', () => {
  it('refuses an immediate write and accepts a durable one', () => {
    expect(Contract.durable).type.toBeCallableWith({ ...hold })
    expect(Contract.durable).type.not.toBeCallableWith({ ...transfer, links: [] })
  })

  it('adds Accepted to the census', () => {
    expect<typeof hold.answer.Type>().type.toBe<
      | {
        readonly _tag: 'Completed'
        readonly output: { readonly outcome: 'confirmed' | 'expired' }
        readonly next: NextToNothing
      }
      | { readonly _tag: 'Refused'; readonly refusal: never; readonly next: NextToNothing }
      | { readonly _tag: 'Rejected'; readonly issue: string }
      | { readonly _tag: 'Accepted'; readonly operation: Contract.OperationId; readonly next: NextToNothing }
    >()
  })
})
