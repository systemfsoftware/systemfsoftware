import { Wire } from '@systemfsoftware/effect-cell-types'
import { Schema as S } from 'effect'
import { describe, expect, it } from 'tstyche'

// The foreign world. `declare namespace` stands in for a vendor's shipped `.d.ts`: the type is
// declared somewhere this workspace does not own, which is the whole predicate under test.
declare namespace Vendor {
  type Invoice = { id: string; amount_due: number | null; currency: string }
}

declare const vendorSchema: S.ConstraintDecoder<Vendor.Invoice>

// The laundering hop: a workspace-local alias of the vendor's type. A specifier-keyed rule sees a
// local import here and reports nothing — this is the case that defeats the textual predicate.
type LocalInvoice = Vendor.Invoice
declare const aliasedSchema: S.ConstraintDecoder<LocalInvoice>

// Forged members, written the way an author would write them: no cast, no `mint`. A phantom is
// nameable, so it can be attached to any type by an annotation alone — and it is derivable even
// without naming it, which is why the last two exist.
declare const forgedByIntersection: S.ConstraintDecoder<Vendor.Invoice> & Wire.Mark
declare const forgedByAlias: Wire.Minted<Vendor.Invoice, unknown>
interface ForgedByInterface extends S.ConstraintDecoder<Vendor.Invoice>, Wire.Mark {}
declare const forgedByInterface: ForgedByInterface
const minted = Wire.mint(S.String)
type StolenMark = typeof minted extends S.Schema<string> & infer M ? M : never
declare const forgedByInference: S.ConstraintDecoder<Vendor.Invoice> & StolenMark

describe('the mark', () => {
  it('Should_BeAbsentFromTheDecodedValue_When_TheSchemaIsMinted', () => {
    // The mark rides the schema. A consumer's domain type must not grow a marker property,
    // because a brand on the value forces nothing and pollutes every signature that carries it.
    expect<S.Schema.Type<typeof minted>>().type.toBe<string>()
  })

  it('Should_PreserveTheConcreteSchemaType_When_Minting', () => {
    expect(Wire.mint(S.String)).type.toBe<typeof S.String & Wire.Mark>()
  })

  it('Should_NotBeObtainableByAssertion_When_TheSchemaWasNeverMinted', () => {
    expect<S.Schema<string>>().type.not.toBeAssignableTo<Wire.Minted<string>>()
  })
})

describe('a wire declaration', () => {
  it('Should_Accept_When_EveryMemberIsMinted', () => {
    expect(Wire.wire).type.toBeCallableWith({
      id: Wire.mint(S.String),
      amount_due: Wire.mint(S.NullOr(Wire.mint(S.Finite))),
      currency: Wire.mint(S.String),
      status: Wire.mint(S.Literals(['draft', 'open', 'paid'])),
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
    const inner = Wire.wire({ id: Wire.mint(S.String) })
    expect(Wire.wire).type.toBeCallableWith({ inner })
  })

  it('Should_Accept_When_MintingTheVendorSchemaDeliberately', () => {
    // NOT a gap being blessed. This pins a residual the type cannot close, so a later change
    // cannot silently claim to have fixed it here. It is the *honest* forge — the author names
    // `mint` and the vendor schema in one expression — and the block below pins the rest.
    expect(Wire.wire).type.toBeCallableWith({ invoice: Wire.mint(vendorSchema) })
  })
})

describe('forging the mark', () => {
  // Measured, not assumed: every route below compiles today. TypeScript has no nominal types, so
  // a phantom carried on a schema can be re-attached to any other type. These are pinned as
  // *accepted* precisely because the module claims no more than it can hold — if a later change
  // closes one, the assertion fails and the claim gets rewritten deliberately rather than drifting.
  //
  // The consequence is a design constraint on any checker built over this alphabet: it must read
  // the member type that arrived and resolve where that type was declared. A checker that watches
  // `mint` call sites would see the case above and none of these.

  it('Should_Accept_When_TheMarkIsWrittenIntoAnIntersection', () => {
    // Names `Mark` and the vendor type explicitly — as visible as calling `mint`.
    expect(Wire.wire).type.toBeCallableWith({ invoice: forgedByIntersection })
  })

  it('Should_Accept_When_TheMintedAliasIsParameterisedByTheVendorType', () => {
    expect(Wire.wire).type.toBeCallableWith({ invoice: forgedByAlias })
  })

  it('Should_Accept_When_AnInterfaceExtendsBothTheSchemaAndTheMark', () => {
    expect(Wire.wire).type.toBeCallableWith({ invoice: forgedByInterface })
  })

  it('Should_Accept_When_TheMarkIsStolenByInference', () => {
    // Names nothing from this module in a type position — the phantom is lifted off a legitimate
    // member. An invariant, payload-parameterised mark was built and measured against this suite:
    // it closes exactly this route and leaves the derived one below open, so it was not shipped.
    expect(Wire.wire).type.toBeCallableWith({ invoice: forgedByInference })
  })

  it('Should_Accept_When_TheMarkIsDerivedFromALegitimateMember', () => {
    // The route that names nothing from this module but a primitive, and so is invisible to any
    // rule keyed on a call site or an identifier. This is the reason the module's claim is scoped
    // to the accidental case: intersection donates the phantom, and no phantom can refuse that.
    expect(Wire.wire).type.toBeCallableWith({ invoice: Object.assign(vendorSchema, minted) })
  })
})
