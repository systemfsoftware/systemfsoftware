/**
 * The wire alphabet — a declaration is built from members this workspace owns, so a foreign
 * contract has nothing to be.
 *
 * A wire declaration restates a foreign payload in primitives. Whether a type may be named there
 * is a property of that type's declaration site, so no filename-keyed rule can decide it: the
 * author who writes the violation is the author who names the file. A specifier-keyed rule cannot
 * decide it either — one workspace-local alias of a vendor type defeats the textual predicate.
 *
 * What decides it is the type. Every combinator here takes marked inputs and returns marked
 * outputs, and {@link wire} accepts nothing else. A vendor type carries no mark and an alias of
 * one confers none, so the refusal is a compile error at the authoring site — and it travels to
 * every consumer through the published `.d.ts`, which is the one channel a library controls.
 *
 * The mark sits on the schema and never on the decoded value. A brand on the value forces
 * nothing: `Schema.make(x, true)` and a bare cast each mint a branded value with every refinement
 * skipped.
 *
 * ## What this cannot do
 *
 * This alphabet is a prohibition, not an obligation. It refuses a foreign member of a declaration
 * that is built from it, and it says nothing at all about a declaration that never imports it: a
 * bare `Schema.Struct({ vendor })` in a new file compiles silently. Coverage is therefore the
 * coverage of adoption, which is the same shape of gap as a rule keyed on a filename — an author
 * escapes by not opting in, and escaping costs nothing. The difference is what can close it: a
 * filename gap is closable only by another label, while this one is closable by a structural
 * predicate over the declaration itself, because "exports a struct schema" is a shape rather than
 * a name. Closing it is a checker's job and is not attempted here.
 *
 * The mark is forgeable, and not only by calling {@link mint} deliberately. TypeScript has no
 * nominal types, so any value that legitimately carries the phantom can donate it to any other
 * type by intersection: `Object.assign(vendorSchema, Wire.string)` yields a marked vendor schema
 * while naming nothing from this module but a primitive. Writing the intersection out — as
 * `Schema<Vendor, unknown> & Mark`, as `Minted<Vendor, unknown>`, or as an interface extending
 * both — does the same. Measured, not assumed: five such routes compile, and parameterising the
 * mark by its payload in an invariant position closes only the inference route, leaving the
 * `Object.assign` one open, which is why no such machinery is here.
 *
 * So this module refuses the accidental case and nothing more. It is not a set of enumerable
 * doors a checker can watch, because the derivable forge names no door at all. A rule that means
 * to decide admissibility must read the member type that arrived and resolve where it was
 * declared — never how it came to be marked. The alphabet is kept wide enough that an author
 * never has to reach for a forge by accident: a member that must be minted to exist is a member
 * the alphabet should have carried.
 *
 * `transform` and `compose` are deliberately absent. A transform whose source is a foreign schema
 * is exactly the laundering hop this module exists to refuse, and one that stays inside the
 * alphabet composes from members that are already marked.
 */
import { Schema as S } from 'effect'

declare const MintedMarker: unique symbol

/** The mark. Unforgeable outside this module without a cast, and absent from the decoded value. */
export interface Mark {
  readonly [MintedMarker]: 'workspace-declared'
}

/** A schema this workspace vouches for: something here declares its type, not a vendor. */
export type Minted<A, I = A> = S.Schema<A, I> & Mark

/**
 * Any marked schema, for constraint positions.
 *
 * `S.Schema.Any` admits any schema whatever; the intersection is what carries the refusal, so a
 * vendor schema fails this constraint on the missing mark rather than on its shape.
 */
export type AnyMinted = S.Schema.Any & Mark

/**
 * Any marked struct member — a schema, or a property signature from {@link optional}.
 *
 * Mirrors Effect's own `Struct.Field` union so the alphabet accepts exactly the positions
 * `Schema.Struct` accepts, and nothing wider.
 */
export type MintedField = S.Struct.Field & Mark

/**
 * Vouch for a member whose type this workspace declares.
 *
 * This is where the alphabet's own marks originate: every combinator below composes marked
 * inputs into marked outputs, so nothing in this module mints except here. It is the honest door
 * rather than the only one — the phantom is derivable by intersection, so a checker that watched
 * this call site alone would watch the one route an author takes on purpose and miss the rest.
 *
 * The concrete member type is preserved rather than flattened to {@link Minted}, so a marked
 * struct stays a struct and Effect's own inference keeps working through the alphabet.
 *
 * The narrowing goes through an assertion signature rather than an `as` cast. The cast is what
 * `typescript(no-unsafe-type-assertion)` refuses, so this is the sanctioned form and no
 * suppression is needed anywhere in the module — which is the point: the unchecked step is
 * concentrated in one named function with an empty body, and that body is the only place this
 * file could lie. It is sound rather than merely permitted — {@link Mark} is a phantom whose only
 * member is a `declare`d unique symbol, so it adds no property any caller can read, and the value
 * handed back is the member that came in.
 */
export const mint = <Field extends S.Struct.Field>(field: Field): Field & Mark => {
  assertMinted(field)
  return field
}

function assertMinted<Field extends S.Struct.Field>(_field: Field): asserts _field is Field & Mark {}

/** A string this workspace declares. */
export const string: Minted<string> = mint(S.String)

/** A number this workspace declares. */
export const number: Minted<number> = mint(S.Number)

/** A boolean this workspace declares. */
export const boolean: Minted<boolean> = mint(S.Boolean)

/** An integer this workspace declares. */
export const integer: Minted<number> = mint(S.Int)

/** A literal set. Literals are values, so they name no declaration that could be foreign. */
export const literal = <const Literals extends ReadonlyArray<string | number | boolean | null | bigint>>(
  ...literals: Literals
): Minted<Literals[number]> => mint(S.Literal(...literals))

/** Widen a marked member to admit `null`. Widening does not change where the member was declared. */
export const nullOr = <A, I>(member: Minted<A, I>): Minted<A | null, I | null> => mint(S.NullOr(member))

/** Widen a marked member to admit `undefined`. */
export const undefinedOr = <A, I>(member: Minted<A, I>): Minted<A | undefined, I | undefined> =>
  mint(S.UndefinedOr(member))

/** Widen a marked member to admit both `null` and `undefined`. */
export const nullishOr = <A, I>(member: Minted<A, I>): Minted<A | null | undefined, I | null | undefined> =>
  mint(S.NullishOr(member))

/** An array of a marked member. */
export const array = <A, I>(member: Minted<A, I>): Minted<ReadonlyArray<A>, ReadonlyArray<I>> => mint(S.Array(member))

/**
 * A field that may be absent from the payload entirely.
 *
 * Key-level optionality is a property signature rather than a schema, which is why {@link Fields}
 * admits both — a payload with a missing key is the commonest shape a vendor contract has, and an
 * author who cannot express it here would have to mint one.
 */
export const optional = <Member extends AnyMinted>(member: Member) => mint(S.optional(member))

/** An open map: marked keys, marked values. */
export const record = <K extends AnyMinted, V extends AnyMinted>(key: K, value: V) => mint(S.Record({ key, value }))

/** One of several marked shapes. */
export const union = <Members extends readonly [AnyMinted, AnyMinted, ...Array<AnyMinted>]>(...members: Members) =>
  mint(S.Union(...members))

/** A positional tuple of marked elements. */
export const tuple = <Elements extends ReadonlyArray<AnyMinted>>(...elements: Elements) => mint(S.Tuple(...elements))

/** A recursive member. Suspending a declaration does not move where it was declared. */
export const suspend = <A, I>(thunk: () => Minted<A, I>): Minted<A, I> => mint(S.suspend(thunk))

/**
 * Constrain a marked member's values.
 *
 * A refinement narrows which values pass; it does not move where the type was declared, so the
 * mark survives. Effect's own `.pipe(S.minLength(1))` does not preserve it, which is why this
 * exists — without it, every validated member would have to be minted.
 */
export const refine = <Member extends AnyMinted>(
  member: Member,
  predicate: (a: S.Schema.Type<Member>) => boolean,
  annotations?: S.Annotations.Filter<S.Schema.Type<Member>>,
) => mint(S.filter(predicate, annotations)(member))

/** The fields a wire declaration may be built from: marked, every one of them. */
export type Fields = Record<string, MintedField>

/**
 * A wire declaration: a foreign payload restated in members this workspace owns.
 *
 * The parameter type is the whole law. Every member must carry the mark, so a vendor type, an
 * alias of one, or any schema built outside the alphabet is a compile error naming the field —
 * and the refusal reaches every consumer of this package through the emitted declaration.
 */
export const wire = <F extends Fields>(fields: F): S.Struct<F> & Mark => mint(S.Struct(fields))
