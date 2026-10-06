import { Cell } from '@systemfsoftware/effect-cell-types'
import { Contract, Operations } from '@systemfsoftware/effect-contract'
import { Effect, Schema } from 'effect'

const hold = Contract.durable({
  name: 'hold',
  description: 'Holds a seat until it is confirmed or expires.',
  input: Schema.Struct({ ttlMs: Schema.Int.check(Schema.isGreaterThan(0)) }),
  output: Schema.Struct({ outcome: Schema.Literals(['confirmed', 'expired']) }),
  refusals: Schema.Never,
  access: new Contract.DurableWrite({ risk: 'MinimalImpact' }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

type AnswerOf<C extends Contract.Any> = C['answer']['Type']

const holdOperation = Effect.runSync(
  Effect.orDie(Schema.decodeEffect(Operations.OperationId)('AAAAAAAAAAAAAAAAAAAAAA')),
)

const holdAccepted: AnswerOf<typeof hold> = { _tag: 'Accepted', operation: holdOperation, next: [] }

const holdCell: Contract.CellOf<typeof hold> = Cell.succeed(holdAccepted)

const registry = Contract.registry({ hold: Contract.implement(hold, holdCell) })

export type OperationAnswer = (typeof Operations.getOperation)['answer']['Type']

export interface ReadOperationOptions {
  readonly operation: Operations.OperationId
  readonly principal: Contract.Principal
}

export const readOperation = (
  options: ReadOperationOptions,
): Effect.Effect<OperationAnswer, Contract.Unavailable, Operations.Operations> =>
  registry.getOperation.cell.run({ input: { operation: options.operation }, principal: options.principal })

export const person = (subject: string): Effect.Effect<Contract.Principal> =>
  Effect.orDie(Schema.decodeEffect(Contract.Principal)({ _tag: 'Person', subject, scopes: [] }))
