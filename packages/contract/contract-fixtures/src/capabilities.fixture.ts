import { Cell } from '@systemfsoftware/effect-cell-types'
import { Contract, Operations, Sandbox } from '@systemfsoftware/effect-contract'
import { DateTime, Effect, Schema } from 'effect'

type AnswerOf<C extends Contract.Any> = C['answer']['Type']

const asOf = DateTime.toDate(DateTime.makeUnsafe('2020-01-01T00:00:00Z'))

const writeBalanceScope = Effect.runSync(Effect.orDie(Schema.decodeEffect(Contract.Scope)('write:balance')))
const rateProviderHost = Effect.runSync(Effect.orDie(Schema.decodeEffect(Contract.Host)('api.example.com')))
const holdOperation = Effect.runSync(
  Effect.orDie(Schema.decodeEffect(Operations.OperationId)('AAAAAAAAAAAAAAAAAAAAAA')),
)

const accountInput = () =>
  Schema.Struct({
    account: Schema.String.pipe(Schema.check(Schema.isPattern(/^acct_[a-z0-9]{8}$/)), Schema.brand('AccountId')),
  })

export const getBalance: Contract.Any & {
  readonly name: 'getBalance'
  readonly access: Contract.Read
  readonly links: readonly []
} = Contract.make({
  name: 'getBalance',
  description: 'Reads an account balance, fresh for a minute.',
  input: accountInput(),
  output: Schema.Struct({ cents: Schema.BigInt, asOf: Schema.Date }),
  refusals: Schema.Never,
  access: new Contract.Read({ cache: new Contract.Fresh({ maxAgeSeconds: 60 }) }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

export const ping: Contract.Any & {
  readonly name: 'ping'
  readonly access: Contract.Read
  readonly links: readonly []
} = Contract.make({
  name: 'ping',
  description: 'Answers whether a stateful program target is reachable.',
  input: Schema.Struct({}),
  output: Schema.Union([Schema.TaggedStruct('Pong', { at: Schema.Date }), Schema.TaggedStruct('Silent', {})]),
  refusals: Schema.Never,
  access: new Contract.Read({ cache: new Contract.Revalidate({}) }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

export const topUp: Contract.Any & {
  readonly name: 'topUp'
  readonly access: Contract.Write
  readonly links: readonly ['getBalance']
} = Contract.make({
  name: 'topUp',
  description: 'Adds funds to an account.',
  input: Schema.Struct({
    account: Schema.String.pipe(Schema.check(Schema.isPattern(/^acct_[a-z0-9]{8}$/)), Schema.brand('AccountId')),
    amountCents: Schema.Int.check(Schema.isGreaterThan(0)),
  }),
  output: Schema.Struct({ cents: Schema.BigInt }),
  refusals: Schema.Union([
    Schema.TaggedStruct('InsufficientFunds', { shortBy: Schema.Finite }),
    Schema.TaggedStruct('AccountFrozen', {}),
  ]),
  access: new Contract.Write({ risk: 'Critical' }),
  exposure: new Contract.Restricted({ scopes: [writeBalanceScope] }),
  egress: new Contract.Closed({}),
  links: ['getBalance'],
})

export const runProgram: Contract.Any & {
  readonly name: 'runProgram'
  readonly access: Contract.Write
  readonly links: readonly []
} = Contract.make({
  name: 'runProgram',
  description: 'Runs a stateful program against its own rows.',
  input: Sandbox.SandboxInput,
  output: Schema.Struct({ rows: Schema.Array(Schema.String) }),
  refusals: Schema.Never,
  access: new Contract.Write({ risk: 'ContainedWrite' }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

export const quoteRate: Contract.Any & {
  readonly name: 'quoteRate'
  readonly access: Contract.Read
  readonly links: readonly []
} = Contract.make({
  name: 'quoteRate',
  description: 'Quotes a currency rate from the allowed provider.',
  input: Schema.Struct({ currency: Schema.String }),
  output: Schema.Struct({ rate: Schema.Finite, asOf: Schema.Date }),
  refusals: Schema.Never,
  access: new Contract.Read({ cache: new Contract.Revalidate({}) }),
  exposure: new Contract.Public({}),
  egress: new Contract.AllowList({ hosts: [rateProviderHost] }),
  links: [],
})

export const hold: Contract.Any & {
  readonly name: 'hold'
  readonly access: Contract.DurableWrite
  readonly links: readonly ['confirmHold']
} = Contract.durable({
  name: 'hold',
  description: 'Holds a seat until it is confirmed or expires.',
  input: Schema.Struct({ ttlMs: Schema.Int.check(Schema.isGreaterThan(0)) }),
  output: Schema.Struct({ outcome: Schema.Literals(['confirmed', 'expired']) }),
  refusals: Schema.Never,
  access: new Contract.DurableWrite({ risk: 'MinimalImpact' }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: ['confirmHold'],
})

export const confirmHold: Contract.Any & {
  readonly name: 'confirmHold'
  readonly access: Contract.Write
  readonly links: readonly []
} = Contract.make({
  name: 'confirmHold',
  description: 'Settles a hold as confirmed.',
  input: Schema.Struct({ operation: Operations.OperationId }),
  output: Schema.Struct({ outcome: Schema.Literals(['confirmed']) }),
  refusals: Schema.Never,
  access: new Contract.Write({ risk: 'MinimalImpact' }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

const getBalanceCompleted: AnswerOf<typeof getBalance> = {
  _tag: 'Completed',
  output: { cents: 12_500n, asOf },
  next: [],
}

const pingCompleted: AnswerOf<typeof ping> = {
  _tag: 'Completed',
  output: { _tag: 'Pong', at: asOf },
  next: [],
}

const insufficientFunds = { _tag: 'InsufficientFunds', shortBy: 500 }

const topUpRefused: AnswerOf<typeof topUp> = {
  _tag: 'Refused',
  refusal: insufficientFunds,
  next: [],
}

const runProgramCompleted: AnswerOf<typeof runProgram> = {
  _tag: 'Completed',
  output: { rows: [] },
  next: [],
}

const holdAccepted: AnswerOf<typeof hold> = { _tag: 'Accepted', operation: holdOperation, next: [] }

const confirmHoldCompleted: AnswerOf<typeof confirmHold> = {
  _tag: 'Completed',
  output: { outcome: 'confirmed' },
  next: [],
}

const getBalanceCell: Contract.CellOf<typeof getBalance> = Cell.succeed(getBalanceCompleted)
const pingCell: Contract.CellOf<typeof ping> = Cell.succeed(pingCompleted)
const topUpCell: Contract.CellOf<typeof topUp> = Cell.succeed(topUpRefused)
const runProgramCell: Contract.CellOf<typeof runProgram> = Cell.succeed(runProgramCompleted)
const holdCell: Contract.CellOf<typeof hold> = Cell.succeed(holdAccepted)
const confirmHoldCell: Contract.CellOf<typeof confirmHold> = Cell.succeed(confirmHoldCompleted)
const quoteRateCell: Contract.CellOf<typeof quoteRate> = Cell.fail(
  new Contract.Unavailable({ reason: 'the rate provider is unreachable' }),
)

export const capabilities = {
  getBalance: Contract.implement(getBalance, getBalanceCell),
  ping: Contract.implement(ping, pingCell),
  topUp: Contract.implement(topUp, topUpCell),
  runProgram: Contract.implement(runProgram, runProgramCell),
  quoteRate: Contract.implement(quoteRate, quoteRateCell),
  hold: Contract.implement(hold, holdCell),
  confirmHold: Contract.implement(confirmHold, confirmHoldCell),
}
