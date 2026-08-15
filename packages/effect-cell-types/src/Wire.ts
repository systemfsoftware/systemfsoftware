/**
 * The wire alphabet — build a schema for a foreign payload out of members you declare, so no
 * vendor type can be named inside it.
 *
 * A wire declaration restates an external payload in your own primitives. Build one with
 * {@link wire}, giving it fields taken from this module:
 *
 * ```ts
 * import { Wire } from '@systemfsoftware/effect-cell-types'
 *
 * const Invoice = Wire.wire({
 *   id: Wire.string,
 *   amountDue: Wire.nullOr(Wire.number),
 *   status: Wire.literal('draft', 'open', 'paid'),
 *   metadata: Wire.record(Wire.string, Wire.string),
 *   deleted: Wire.optional(Wire.boolean),
 * })
 * ```
 *
 * {@link wire} accepts only members carrying a mark, and marks come from this module. Passing a
 * vendor's schema — or a local type alias of a vendor's type — is a compile error naming the
 * field, at the point the declaration is written. The refusal is in the type, so it reaches every
 * consumer through the published declaration file rather than requiring a lint setup.
 *
 * The mark rides the schema and never appears on the decoded value: `Schema.Type<typeof
 * Wire.string>` is exactly `string`, so domain types stay clean.
 *
 * ## Limits
 *
 * Two things this does not do, both by construction rather than oversight.
 *
 * It constrains only declarations that use it. A module that imports `Schema` directly and writes
 * `Schema.Struct({ vendor })` is unaffected, so coverage is the coverage of adoption. Enforcing
 * that every declaration uses the alphabet needs a checker, not a type.
 *
 * The mark is a phantom, and TypeScript is structural, so a determined author can attach it to
 * anything — by writing the intersection out, or by deriving it from a member that legitimately
 * carries it. This module therefore refuses the accidental case: reaching for `Schema.String`
 * instead of {@link string}, or dropping a vendor schema into a field. It is not a security
 * boundary, and code that must decide admissibility should resolve where a member's type was
 * declared rather than inspect how it came to be marked.
 *
 * `transform` and `compose` are absent deliberately: a transform whose source is a foreign schema
 * is the conversion this module exists to refuse, and one that stays inside the alphabet composes
 * from members that are already marked.
 */
import { Schema as S } from 'effect'
import type { SchemaAST } from 'effect'

declare const MintedMarker: unique symbol

/** The mark a wire member carries. A phantom: present on the schema, absent from decoded values. */
export interface Mark {
  readonly [MintedMarker]: 'workspace-declared'
}

/** A schema this workspace declares the type of. */
export type Minted<A, I = A> = S.Schema<A, I> & Mark

/** Any marked schema, for constraint positions. */
export type AnyMinted = S.Schema.Any & Mark

/** Any marked struct member — a schema, or a property signature from {@link optional}. */
export type MintedField = S.Struct.Field & Mark

/**
 * Mark a member whose type this workspace declares.
 *
 * Prefer the alphabet below; reach for this only to admit a schema the alphabet cannot express.
 * Marking a vendor's schema compiles and is the deliberate way to opt out of the constraint.
 *
 * The concrete member type is preserved rather than widened to {@link Minted}, so a marked struct
 * stays a struct and Effect's inference keeps working. The value returned is the one passed in.
 */
export const mint = <Field extends S.Struct.Field>(field: Field): Field & Mark => {
  assertMinted(field)
  return field
}

// Narrowing goes through an assertion signature rather than an `as` cast: the cast is what
// `typescript(no-unsafe-type-assertion)` refuses, so no suppression is needed anywhere in the
// module and the unchecked step stays in one empty-bodied function.
function assertMinted<Field extends S.Struct.Field>(_field: Field): asserts _field is Field & Mark {}

/** A string. */
export const string: Minted<string> = mint(S.String)

/** A number. */
export const number: Minted<number> = mint(S.Number)

/** A boolean. */
export const boolean: Minted<boolean> = mint(S.Boolean)

/** An integer. */
export const integer: Minted<number> = mint(S.Int)

/** A literal set. Literals are values, so they name no declaration. */
export const literal = <const Literals extends ReadonlyArray<SchemaAST.LiteralValue>>(
  ...literals: Literals
): Minted<Literals[number]> => mint(S.Literal(...literals))

/** Widen a member to admit `null`. */
export const nullOr = <A, I>(member: Minted<A, I>): Minted<A | null, I | null> => mint(S.NullOr(member))

/** Widen a member to admit `undefined`. */
export const undefinedOr = <A, I>(member: Minted<A, I>): Minted<A | undefined, I | undefined> =>
  mint(S.UndefinedOr(member))

/** Widen a member to admit both `null` and `undefined`. */
export const nullishOr = <A, I>(member: Minted<A, I>): Minted<A | null | undefined, I | null | undefined> =>
  mint(S.NullishOr(member))

/** An array of a member. */
export const array = <A, I>(member: Minted<A, I>): Minted<ReadonlyArray<A>, ReadonlyArray<I>> => mint(S.Array(member))

/** A field that may be absent from the payload entirely. */
export const optional = <Member extends AnyMinted>(member: Member) => mint(S.optional(member))

/** An open map. */
export const record = <K extends AnyMinted, V extends AnyMinted>(key: K, value: V) => mint(S.Record({ key, value }))

/** One of several shapes. */
export const union = <Members extends readonly [AnyMinted, AnyMinted, ...Array<AnyMinted>]>(...members: Members) =>
  mint(S.Union(...members))

/** A positional tuple. */
export const tuple = <Elements extends ReadonlyArray<AnyMinted>>(...elements: Elements) => mint(S.Tuple(...elements))

/** A recursive member, for payloads that nest into themselves. */
export const suspend = <A, I>(thunk: () => Minted<A, I>): Minted<A, I> => mint(S.suspend(thunk))

/**
 * Constrain a member's values.
 *
 * Use this rather than `member.pipe(Schema.minLength(1))`, which returns an unmarked schema.
 */
export const refine = <Member extends AnyMinted>(
  member: Member,
  predicate: (a: S.Schema.Type<Member>) => boolean,
  annotations?: S.Annotations.Filter<S.Schema.Type<Member>>,
) => mint(S.filter(predicate, annotations)(member))

/** The fields a wire declaration is built from. */
export type Fields = Record<string, MintedField>

/**
 * Declare a schema for a foreign payload, restated in members you own.
 *
 * Every field must come from this module. A vendor's schema, or a local alias of a vendor's type,
 * is a compile error naming the offending field.
 */
export const wire = <F extends Fields>(fields: F): S.Struct<F> & Mark => mint(S.Struct(fields))
