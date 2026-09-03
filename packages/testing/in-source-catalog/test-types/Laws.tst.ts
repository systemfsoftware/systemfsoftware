import { describe, expect, it } from 'tstyche'
import { catalog } from '../src/mod.js'

interface RegistryInput {
  readonly tenant: string
  readonly tier: string
  readonly slot: string
}

type RegistryDecision =
  | { readonly ok: true; readonly root: string; readonly readOnly: boolean }
  | { readonly ok: false; readonly why: string }

declare const decideRegistrySlot: (input: RegistryInput) => RegistryDecision
declare const refused: (result: RegistryDecision) => boolean
declare const joinPath: (...parts: string[]) => string
declare const pinnedBySomeCaller: string

const licensed = {
  id: 'decideRegistrySlot',
  run: decideRegistrySlot,
  reserved: catalog.refuseHomes.reservedEnvFile((envFilePath: string) => ({
    tenant: 'widgets',
    tier: 'primary',
    slot: envFilePath,
  })),
  refused,
} as const

const authoredCases = [
  {
    label: 'primary',
    input: { tenant: 'widgets', tier: 'primary', slot: 'widgets' },
    project: (decision: RegistryDecision) => (decision.ok ? { root: decision.root, readOnly: decision.readOnly } : {}),
    expect: { root: '/var/lib/registry', readOnly: true },
  },
] as const

describe('the laws surface admits only minted values', () => {
  it('Should_RegisterTheLicensedSpec_When_EverySlotIsMinted', () => {
    expect(catalog.laws).type.toBeCallableWith(licensed)
  })

  it('Should_RejectAuthoredLists_When_ReservedIsAStringArray', () => {
    expect(catalog.laws).type.not.toBeCallableWith({ ...licensed, reserved: ['/tmp/secrets.env'] })
  })

  it('Should_RejectForeignArbitraries_When_ReservedIsUnminted', () => {
    expect(catalog.laws).type.not.toBeCallableWith({
      ...licensed,
      reserved: { generate: () => ({ value: {} }) },
    })
  })

  it('Should_RejectOmittedReserved_When_TheSpecLeavesItOut', () => {
    expect(catalog.laws).type.not.toBeCallableWith({ id: 'x', run: decideRegistrySlot, refused })
  })

  it('Should_RejectOmittedRefused_When_TheSpecLeavesItOut', () => {
    expect(catalog.laws).type.not.toBeCallableWith({
      id: 'x',
      run: decideRegistrySlot,
      reserved: licensed.reserved,
    })
  })

  it('Should_RejectUnmintedPublished_When_RawCasesArePassed', () => {
    expect(catalog.laws).type.not.toBeCallableWith({
      ...licensed,
      published: {
        cases: [
          {
            label: 'primary',
            input: { tenant: 'widgets', tier: 'primary', slot: 'widgets' },
            project: (decision: RegistryDecision) => (decision.ok ? { root: decision.root } : {}),
            expect: { root: '/var/lib/registry' },
          },
        ],
      },
    })
  })
})

describe('the contract constructor rejects derived expectations', () => {
  it('Should_MintTheContract_When_ExpectationsAreLiterals', () => {
    expect(catalog.contract).type.toBeCallableWith(authoredCases)
  })

  it('Should_RejectDerivedExpectations_When_JoinPathReconstructsTheContract', () => {
    expect(catalog.contract).type.not.toBeCallableWith([
      {
        label: 'primary',
        input: { tenant: 'widgets', tier: 'primary', slot: 'widgets' },
        project: (
          decision: RegistryDecision,
        ) => (decision.ok ? { root: decision.root, readOnly: decision.readOnly } : {}),
        expect: { root: joinPath('/var/lib', 'registry'), readOnly: true },
      },
    ])
  })

  it('Should_RejectWideVariables_When_AnExpectationIsNotALiteral', () => {
    expect(catalog.contract).type.not.toBeCallableWith([
      {
        label: 'primary',
        input: { tenant: 'widgets', tier: 'primary', slot: 'widgets' },
        project: (
          decision: RegistryDecision,
        ) => (decision.ok ? { root: decision.root, readOnly: decision.readOnly } : {}),
        expect: { root: pinnedBySomeCaller, readOnly: true },
      },
    ])
  })
})

describe('the contract gate is a guardrail, not a proof', () => {
  // Documented boundary: recomputing a published value into a wide string is a
  // type error, while a helper that preserves literal types passes the gate and
  // is caught by review and the sabotage quartet instead.
  const join = <A extends string, B extends string>(a: A, b: B): `${A}/${B}` => `${a}/${b}`

  it('Should_AcceptLiteralTypedHelperOutput_When_TheGateIsAGuardrail', () => {
    expect(catalog.contract).type.toBeCallableWith([
      {
        label: 'primary',
        input: { tenant: 'widgets', tier: 'primary', slot: 'widgets' },
        project: (decision: RegistryDecision) =>
          decision.ok ? { root: decision.root, readOnly: decision.readOnly } : {},
        expect: { root: join('/var/lib', 'registry'), readOnly: true },
      },
    ])
  })
})

describe('the inverse is only licensed beside a published contract', () => {
  it('Should_RejectInverseWithoutPublished_When_PublishedIsAbsent', () => {
    expect(catalog.laws).type.not.toBeCallableWith({
      ...licensed,
      inverse: (result: RegistryDecision) => ({
        tenant: 'widgets',
        tier: 'primary',
        slot: result.ok ? result.root : 'widgets',
      }),
    })
  })

  it('Should_RegisterInverseWithPublished_When_BothArePresent', () => {
    expect(catalog.laws).type.toBeCallableWith({
      ...licensed,
      published: catalog.contract(authoredCases),
      inverse: (result: RegistryDecision) => ({
        tenant: 'widgets',
        tier: 'primary',
        slot: result.ok ? result.root : 'widgets',
      }),
    })
  })
})
