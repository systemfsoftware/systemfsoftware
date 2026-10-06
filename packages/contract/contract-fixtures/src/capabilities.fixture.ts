import { Cell } from '@systemfsoftware/effect-cell-types'
import { Contract, Operations, Sandbox } from '@systemfsoftware/effect-contract'
import { Context, DateTime, Effect, Layer, Ref, Result, Schema } from 'effect'

type AnswerOf<C extends Contract.Any> = C['answer']['Type']

const asOf = DateTime.toDate(DateTime.makeUnsafe('2020-01-01T00:00:00Z'))

const initialBalanceCents = 12_500n

/** The fixture account balance, owned by a layer so each build starts fresh and no state outlives its services. */
export class FixtureLedger extends Context.Service<FixtureLedger, Ref.Ref<bigint>>()(
  '@systemfsoftware/contract-fixtures/FixtureLedger',
) {}

export const fixtureLedgerLayer: Layer.Layer<FixtureLedger> = Layer.effect(
  FixtureLedger,
  Ref.make(initialBalanceCents),
)

export type FixtureRequirement = FixtureLedger | Operations.Operations

const writeBalanceScope = Effect.runSync(Effect.orDie(Schema.decodeEffect(Contract.Scope)('write:balance')))
const readStatementScope = Effect.runSync(Effect.orDie(Schema.decodeEffect(Contract.Scope)('read:statement')))
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

const transferInput = () =>
  Schema.Struct({
    account: Schema.String.pipe(Schema.check(Schema.isPattern(/^acct_[a-z0-9]{8}$/)), Schema.brand('AccountId')),
    cents: Schema.Int.check(Schema.isGreaterThan(0)).pipe(Schema.brand('PositiveCents')),
  })

export const transfer: Contract.Any & {
  readonly name: 'transfer'
  readonly access: Contract.Write
  readonly links: readonly []
} = Contract.make({
  name: 'transfer',
  description: 'Sets an account balance, changing what a later read reports.',
  input: transferInput(),
  output: Schema.Struct({ cents: Schema.BigInt }),
  refusals: Schema.Never,
  access: new Contract.Write({ risk: 'ContainedWrite' }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

export const getStatement: Contract.Any & {
  readonly name: 'getStatement'
  readonly access: Contract.Read
  readonly links: readonly []
} = Contract.make({
  name: 'getStatement',
  description: 'Reads a person’s statement, cached privately for half a minute.',
  input: accountInput(),
  output: Schema.Struct({ cents: Schema.BigInt, asOf: Schema.Date }),
  refusals: Schema.Never,
  access: new Contract.Read({ cache: new Contract.Fresh({ maxAgeSeconds: 30 }) }),
  exposure: new Contract.Restricted({ scopes: [readStatementScope] }),
  egress: new Contract.Closed({}),
  links: [],
})

const getBalanceCompleted = (cents: bigint): AnswerOf<typeof getBalance> => ({
  _tag: 'Completed',
  output: { cents, asOf },
  next: [],
})

const getBalanceRejected = (issue: string): AnswerOf<typeof getBalance> => ({ _tag: 'Rejected', issue })

const transferCompleted = (cents: bigint): AnswerOf<typeof transfer> => ({
  _tag: 'Completed',
  output: { cents },
  next: [],
})

const transferRejected = (issue: string): AnswerOf<typeof transfer> => ({ _tag: 'Rejected', issue })

const statementCompleted: AnswerOf<typeof getStatement> = {
  _tag: 'Completed',
  output: { cents: initialBalanceCents, asOf },
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

const getBalanceCell: Contract.CellOf<typeof getBalance, FixtureLedger> = Cell.flatMap(
  Cell.id<Contract.Invocation>(),
  (invocation) =>
    Cell.fromEffect(
      Effect.gen(function*() {
        const decoded = Schema.decodeUnknownResult(accountInput())(invocation.input)
        return yield* Result.match(decoded, {
          onFailure: (error) => Effect.succeed(getBalanceRejected(error.message)),
          onSuccess: () =>
            Effect.gen(function*() {
              const ledger = yield* FixtureLedger
              return getBalanceCompleted(yield* Ref.get(ledger))
            }),
        })
      }),
    ),
)
const transferCell: Contract.CellOf<typeof transfer, FixtureLedger> = Cell.flatMap(
  Cell.id<Contract.Invocation>(),
  (invocation) =>
    Cell.fromEffect(
      Effect.gen(function*() {
        const decoded = Schema.decodeUnknownResult(transferInput())(invocation.input)
        return yield* Result.match(decoded, {
          onFailure: (error) => Effect.succeed(transferRejected(error.message)),
          onSuccess: ({ cents }) =>
            Effect.gen(function*() {
              const ledger = yield* FixtureLedger
              yield* Ref.set(ledger, BigInt(cents))
              return transferCompleted(BigInt(cents))
            }),
        })
      }),
    ),
)
const getStatementCell: Contract.CellOf<typeof getStatement> = Cell.succeed(statementCompleted)
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
  transfer: Contract.implement(transfer, transferCell),
  getStatement: Contract.implement(getStatement, getStatementCell),
}
