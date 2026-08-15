import { Wire } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'
import { describe, expect, it } from 'tstyche'

// The foreign world. `declare namespace` stands in for a vendor's shipped `.d.ts`: the type is
// declared somewhere this workspace does not own, which is the whole predicate under test.
declare namespace Vendor {
  type Invoice = { id: string; amount_due: number | null; currency: string }
}

declare const vendorSchema: S.Schema<Vendor.Invoice, unknown>

// The laundering hop: a workspace-local alias of the vendor's type. A specifier-keyed rule sees a
// local import here and reports nothing — this is the case that defeats the textual predicate.
type LocalInvoice = Vendor.Invoice
declare const aliasedSchema: S.Schema<LocalInvoice, unknown>

describe('the mark', () => {
  it('Should_BeAbsentFromTheDecodedValue_When_TheSchemaIsMinted', () => {
    // The mark rides the schema. A consumer's domain type must not grow a marker property,
    // because a brand on the value forces nothing and pollutes every signature that carries it.
    expect<S.Schema.Type<typeof Wire.string>>().type.toBe<string>()
  })

  it('Should_PreserveTheConcreteSchemaType_When_Minting', () => {
    expect(Wire.mint(S.String)).type.toBe<typeof S.String & Wire.Mark>()
  })

  it('Should_NotBeObtainableByAssertion_When_TheSchemaWasNeverMinted', () => {
    expect<S.Schema<string, string>>().type.not.toBeAssignableTo<Wire.Minted<string>>()
  })
})

describe('a wire declaration', () => {
  it('Should_Accept_When_EveryMemberIsMinted', () => {
    expect(Wire.wire).type.toBeCallableWith({
      id: Wire.string,
      amount_due: Wire.nullOr(Wire.number),
      currency: Wire.string,
      status: Wire.literal('draft', 'open', 'paid'),
    })
  })

  it('Should_Reject_When_TheMemberIsRawAndUnmarked', () => {
    // The accidental case: an author reaches for `S.String` instead of the alphabet.
    expect(Wire.wire).type.not.toBeCallableWith({ id: S.String })
  })

  it('Should_Reject_When_TheMemberNamesTheVendorTypeDirectly', () => {
    expect(Wire.wire).type.not.toBeCallableWith({ invoice: vendorSchema })
  })

  it('Should_Reject_When_TheMemberNamesTheWorkspaceLocalAlias', () => {
    // The laundering hop. Aliasing confers no mark, so the type refuses what a specifier-keyed
    // rule cannot see.
    expect(Wire.wire).type.not.toBeCallableWith({ invoice: aliasedSchema })
  })

  it('Should_Accept_When_TheMemberIsAnotherWireDeclaration', () => {
    const inner = Wire.wire({ id: Wire.string })
    expect(Wire.wire).type.toBeCallableWith({ inner })
  })

  it('Should_Accept_When_MintingTheVendorSchemaDeliberately', () => {
    // NOT a gap being blessed: this pins the one residual the type cannot close, so a later
    // change cannot silently claim to have fixed it here. `mint` is the single call site a
    // declaration-site checker inspects, and closing this case is that checker's whole job.
    expect(Wire.wire).type.toBeCallableWith({ invoice: Wire.mint(vendorSchema) })
  })
})

describe('the combinators', () => {
  it('Should_PreserveTheMark_When_WideningToNull', () => {
    expect(Wire.nullOr(Wire.string)).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_WrappingInAnArray', () => {
    expect(Wire.array(Wire.string)).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_Nested', () => {
    expect(Wire.array(Wire.nullOr(Wire.integer))).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_Reject_When_TheUnmarkedMemberIsWidened', () => {
    // Closure is the property that makes the alphabet hold: a combinator that accepted an
    // unmarked member would launder a vendor type into a marked result in one call.
    expect(Wire.nullOr).type.not.toBeCallableWith(vendorSchema)
  })

  it('Should_Reject_When_TheUnmarkedMemberIsWrappedInAnArray', () => {
    expect(Wire.array).type.not.toBeCallableWith(vendorSchema)
  })
})
