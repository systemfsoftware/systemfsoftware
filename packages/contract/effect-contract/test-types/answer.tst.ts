import { Schema } from 'effect'
import { describe, expect, it } from 'tstyche'
import { Contract } from '../src/mod.js'

const immediateTransfer = Contract.make({
  name: 'transfer',
  description: 'Moves an amount immediately.',
  input: Schema.Struct({ amount: Schema.Finite }),
  output: Schema.Struct({ ok: Schema.Boolean }),
  refusals: Schema.Never,
  access: new Contract.Write({ risk: 'ContainedWrite' }),
  exposure: new Contract.Public({}),
  egress: new Contract.Closed({}),
  links: [],
})

const durableHold = Contract.durable({
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

type NextNothing = ReadonlyArray<{ readonly operation: never; readonly input: Schema.JsonObject }>
type Accepted = { readonly _tag: 'Accepted'; readonly operation: Contract.OperationId; readonly next: NextNothing }

describe('The answer census of a contract', () => {
  it('Should_PinAnImmediateWriteToCompletedRefusedAndRejected_When_TheAccessIsWrite', () => {
    expect<typeof immediateTransfer.answer.Type>().type.toBe<
      | { readonly _tag: 'Completed'; readonly output: { readonly ok: boolean }; readonly next: NextNothing }
      | { readonly _tag: 'Refused'; readonly refusal: never; readonly next: NextNothing }
      | { readonly _tag: 'Rejected'; readonly issue: string }
    >()
  })

  it('Should_AddAcceptedToTheCensus_When_TheAccessIsDurableWrite', () => {
    expect<typeof durableHold.answer.Type>().type.toBe<
      | { readonly _tag: 'Completed'; readonly output: { readonly confirmed: boolean }; readonly next: NextNothing }
      | { readonly _tag: 'Refused'; readonly refusal: never; readonly next: NextNothing }
      | { readonly _tag: 'Rejected'; readonly issue: string }
      | Accepted
    >()
  })

  it('Should_RefuseAnAcceptedValue_When_TheWriteIsImmediate', () => {
    expect<typeof immediateTransfer.answer.Type>().type.not.toBeAssignableFrom<Accepted>()
    expect<typeof durableHold.answer.Type>().type.toBeAssignableFrom<Accepted>()
  })
})

describe('The access a contract may declare', () => {
  it('Should_CarryACachePolicyAndRefuseAWriteRisk_When_TheAccessIsRead', () => {
    expect(Contract.Read).type.toBeConstructableWith({ cache: new Contract.Revalidate({}) })
    expect(Contract.Read).type.not.toBeConstructableWith({ risk: 'ContainedWrite' })
  })

  it('Should_CarryAWriteRiskAndRefuseACachePolicy_When_TheAccessIsWrite', () => {
    expect(Contract.Write).type.toBeConstructableWith({ risk: 'ContainedWrite' })
    expect(Contract.Write).type.not.toBeConstructableWith({ cache: new Contract.Revalidate({}) })
  })
})
