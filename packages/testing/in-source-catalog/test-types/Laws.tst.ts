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

  it('Should_RejectDerivedExpectations_When_JoinPathReconstructsTheContract', () => {
    expect(catalog.laws).type.not.toBeCallableWith({
      ...licensed,
      published: {
        cases: [
          {
            label: 'primary',
            input: { tenant: 'widgets', tier: 'primary', slot: 'widgets' },
            project: (decision: RegistryDecision) => (decision.ok ? { root: decision.root } : {}),
            expect: { root: joinPath('/var/lib', 'registry') },
          },
        ],
      },
    })
  })
})
