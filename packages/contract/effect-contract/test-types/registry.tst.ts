import { Cell } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'
import { describe, expect, it } from 'tstyche'
import { Contract } from '../src/mod.js'
import { getOperation } from '../src/Operations/get-operation.contract.js'
import { Operations } from '../src/Operations/operations.service.js'

const getBalance = Contract.make({
  name: 'getBalance',
  description: 'Reads an account balance.',
  input: Schema.Struct({ account: Schema.String }),
  output: Schema.Struct({ cents: Schema.Finite }),
  refusals: Schema.Never,
  access: new Contract.Read({ cache: new Contract.Revalidate({}) }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

const hold = Contract.durable({
  name: 'hold',
  description: 'Holds a seat until it settles.',
  input: Schema.Struct({ ttlMs: Schema.Finite }),
  output: Schema.Struct({ confirmed: Schema.Boolean }),
  refusals: Schema.Never,
  access: new Contract.DurableWrite({ risk: 'MinimalImpact' }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

const rejecting = Cell.succeed({ _tag: 'Rejected', issue: 'spike' } as const)

const durableRegistry = Contract.registry({ hold: Contract.implement(hold, rejecting) })
const immediateRegistry = Contract.registry({ getBalance: Contract.implement(getBalance, rejecting) })

describe('The registry', () => {
  it('Should_AddTheBuiltInReadCapability_When_AContractIsDurable', () => {
    expect(durableRegistry).type.toHaveProperty('getOperation')
    expect(durableRegistry.getOperation).type.toBe<Contract.Capability<typeof getOperation, Operations>>()
  })

  it('Should_AddNoBuiltInReadCapability_When_EveryContractIsImmediate', () => {
    expect(immediateRegistry).type.not.toHaveProperty('getOperation')
  })
})
