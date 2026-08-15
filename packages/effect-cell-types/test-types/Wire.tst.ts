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

// Two forged members, written the way an author would write them: no cast, no `mint`. A phantom
// is nameable, so it can be attached to any type by an annotation alone.
declare const forgedByIntersection: S.Schema<Vendor.Invoice, unknown> & Wire.Mark
declare const forgedByAlias: Wire.Minted<Vendor.Invoice, unknown>

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

  it('Should_Accept_When_TheMarkIsDerivedFromALegitimateMember', () => {
    // The route that names nothing from this module but a primitive, and so is invisible to any
    // rule keyed on a call site or an identifier. This is the reason the module's claim is scoped
    // to the accidental case: intersection donates the phantom, and no phantom can refuse that.
    expect(Wire.wire).type.toBeCallableWith({ invoice: Object.assign(vendorSchema, Wire.string) })
  })
})

describe('the combinators', () => {
  // Closure is the property that makes the alphabet hold: a combinator that accepted an unmarked
  // member would launder a vendor type into a marked result in one call. The module claims this
  // of *every* combinator, so every combinator is named here — a claim covering more ground than
  // its assertions is a claim that fails silently when a maintainer widens one parameter.

  it('Should_PreserveTheMark_When_TheLiteralSetIsBuilt', () => {
    expect(Wire.literal('draft', 'open')).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_WideningToNull', () => {
    expect(Wire.nullOr(Wire.string)).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_WideningToUndefined', () => {
    expect(Wire.undefinedOr(Wire.string)).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_WideningToNullish', () => {
    expect(Wire.nullishOr(Wire.string)).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_WrappingInAnArray', () => {
    expect(Wire.array(Wire.string)).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_TheFieldIsOptional', () => {
    // A property signature rather than a schema, so it lands in the field union, not `AnyMinted`.
    expect(Wire.optional(Wire.string)).type.toBeAssignableTo<Wire.MintedField>()
  })

  it('Should_PreserveTheMark_When_BuildingAnOpenMap', () => {
    expect(Wire.record(Wire.string, Wire.number)).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_BuildingAUnion', () => {
    expect(Wire.union(Wire.string, Wire.number)).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_BuildingATuple', () => {
    expect(Wire.tuple(Wire.string, Wire.number)).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_Suspended', () => {
    expect(Wire.suspend(() => Wire.string)).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_Refined', () => {
    // Effect's own `.pipe(S.minLength(1))` strips the mark; this is why the alphabet carries a
    // refinement of its own, so a validated member never has to be minted to exist.
    expect(Wire.refine(Wire.string, (a) => a.length > 0)).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_PreserveTheMark_When_Nested', () => {
    expect(Wire.array(Wire.nullOr(Wire.integer))).type.toBeAssignableTo<Wire.AnyMinted>()
  })

  it('Should_Reject_When_TheUnmarkedMemberIsWidened', () => {
    expect(Wire.nullOr).type.not.toBeCallableWith(vendorSchema)
    expect(Wire.undefinedOr).type.not.toBeCallableWith(vendorSchema)
    expect(Wire.nullishOr).type.not.toBeCallableWith(vendorSchema)
  })

  it('Should_Reject_When_TheUnmarkedMemberIsWrappedInAnArray', () => {
    expect(Wire.array).type.not.toBeCallableWith(vendorSchema)
  })

  it('Should_Reject_When_TheUnmarkedMemberIsMadeOptional', () => {
    expect(Wire.optional).type.not.toBeCallableWith(vendorSchema)
  })

  it('Should_Reject_When_TheUnmarkedMemberIsAMapValue', () => {
    expect(Wire.record).type.not.toBeCallableWith(Wire.string, vendorSchema)
  })

  it('Should_Reject_When_TheUnmarkedMemberJoinsAUnion', () => {
    expect(Wire.union).type.not.toBeCallableWith(Wire.string, vendorSchema)
  })

  it('Should_Reject_When_TheUnmarkedMemberJoinsATuple', () => {
    expect(Wire.tuple).type.not.toBeCallableWith(Wire.string, vendorSchema)
  })

  it('Should_Reject_When_TheUnmarkedMemberIsSuspended', () => {
    expect(Wire.suspend).type.not.toBeCallableWith(() => vendorSchema)
  })

  it('Should_Reject_When_TheUnmarkedMemberIsRefined', () => {
    expect(Wire.refine).type.not.toBeCallableWith(vendorSchema, () => true)
  })
})
