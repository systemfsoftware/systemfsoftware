import { Cell } from '@systemfsoftware/effect-cell-types'
import { Contract } from '@systemfsoftware/effect-contract'
import { Schema } from 'effect'

class InsufficientFunds extends Schema.TaggedClass<InsufficientFunds>()('InsufficientFunds', {
  shortBy: Schema.Finite,
}) {}

export const getBalance: Contract.Any & {
  readonly name: 'getBalance'
  readonly access: Contract.Read
  readonly links: readonly []
} = Contract.make({
  name: 'getBalance',
  description: 'Reads an account balance.',
  input: Schema.Struct({ account: Schema.String }),
  output: Schema.Struct({ cents: Schema.Finite }),
  refusals: InsufficientFunds,
  access: new Contract.Read({ cache: new Contract.Revalidate({}) }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

export const hold: Contract.Any & {
  readonly name: 'hold'
  readonly access: Contract.DurableWrite
  readonly links: readonly []
} = Contract.durable({
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

const refusing = Cell.succeed<Contract.Refused | Contract.Rejected>({
  _tag: 'Refused',
  refusal: new InsufficientFunds({ shortBy: 1 }),
  next: [],
})
const rejecting = Cell.succeed({ _tag: 'Rejected', issue: 'fixture' } as const)

export const capabilities: Contract.Registry<{
  readonly getBalance: Contract.Capability<typeof getBalance>
  readonly hold: Contract.Capability<typeof hold>
}> = Contract.registry({
  getBalance: Contract.implement(getBalance, refusing),
  hold: Contract.implement(hold, rejecting),
})

export const immediateCapabilities: Contract.Registry<{
  readonly getBalance: Contract.Capability<typeof getBalance>
}> = Contract.registry({
  getBalance: Contract.implement(getBalance, refusing),
})
