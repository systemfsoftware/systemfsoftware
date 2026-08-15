/**
 * The wire alphabet — build a schema for a foreign payload out of members you declare, so no
 * vendor type can be named inside it.
 *
 * ```ts
 * import { Wire } from '@systemfsoftware/effect-cell-types'
 * import { Schema } from 'effect'
 *
 * const Invoice = Wire.wire({
 *   id: Wire.string,
 *   amountDue: Wire.nullOr(Wire.number),
 *   status: Wire.literal('draft', 'open', 'paid'),
 *   lineItems: Wire.array(Wire.string),
 *   metadata: Wire.record(Wire.string, Wire.string),
 *   deleted: Wire.optional(Wire.boolean),
 * })
 *
 * // Decodes to your own type — `{ id: string; amountDue: number | null; ... }`.
 * const invoice = Schema.decodeUnknownSync(Invoice)(payload)
 * ```
 *
 * Only declarations that use the alphabet are constrained, and {@link mint} admits a foreign
 * schema deliberately. It is a guardrail, not a security boundary.
 */
import { Schema as S } from 'effect'
import type { SchemaAST } from 'effect'

/**
 * Marker a wire member carries once this workspace declares its type. The property type is the
 * fix, so the compiler diagnostic names it.
 *
 * It sits on the schema, never on the decoded value: `Schema.Type<typeof Wire.string>` is `string`.
 */
export interface Mark {
  readonly __WIRE_MEMBER_IS_NOT_BUILT_FROM_THE_ALPHABET__:
    'this member names a type this workspace does not declare; build it from Wire, or admit a foreign schema deliberately with Wire.mint'
}

/** A schema this workspace declares the type of. */
export type Minted<A, I = A> = S.Schema<A, I> & Mark

/** Any marked schema, for constraint positions. */
export type AnyMinted = S.Schema.Any & Mark

/**
 * Any marked struct member — a schema, or a property signature from {@link optional}.
 *
 * The permissive `Any` arms rather than Effect's `Struct.Field`, whose `never` variants fail the
 * assignability check before the marker is reached, leaving the diagnostic to report an unrelated
 * `Type 'string' is not assignable to type 'never'`.
 */
export type MintedField = (S.Schema.Any | S.PropertySignature.Any) & Mark

/**
 * Mark a member whose type this workspace declares.
 *
 * Prefer the alphabet below; reach for this only to admit a schema the alphabet cannot express,
 * including a vendor's own. The value returned is the one passed in, and its concrete type is
 * preserved, so a marked struct stays a struct and Effect's inference keeps working.
 */
export const mint = <Field extends S.Struct.Field>(field: Field): Field & Mark => {
  assertMinted(field)
  return field
}

// An `as` cast is what `typescript(no-unsafe-type-assertion)` refuses, so the narrowing goes
// through an assertion signature and the unchecked step stays in one empty-bodied function.
function assertMinted<Field extends S.Struct.Field>(_field: Field): asserts _field is Field & Mark {}

export const string: Minted<string> = mint(S.String)
export const number: Minted<number> = mint(S.Number)
export const boolean: Minted<boolean> = mint(S.Boolean)
export const integer: Minted<number> = mint(S.Int)

export const literal = <const Literals extends ReadonlyArray<SchemaAST.LiteralValue>>(
  ...literals: Literals
): Minted<Literals[number]> => mint(S.Literal(...literals))

export const nullOr = <A, I>(member: Minted<A, I>): Minted<A | null, I | null> => mint(S.NullOr(member))

export const undefinedOr = <A, I>(member: Minted<A, I>): Minted<A | undefined, I | undefined> =>
  mint(S.UndefinedOr(member))

export const nullishOr = <A, I>(member: Minted<A, I>): Minted<A | null | undefined, I | null | undefined> =>
  mint(S.NullishOr(member))

export const array = <A, I>(member: Minted<A, I>): Minted<ReadonlyArray<A>, ReadonlyArray<I>> => mint(S.Array(member))

/** A field that may be absent from the payload entirely, as distinct from present and `undefined`. */
export const optional = <Member extends AnyMinted>(member: Member) => mint(S.optional(member))

export const record = <K extends AnyMinted, V extends AnyMinted>(key: K, value: V) => mint(S.Record({ key, value }))

export const union = <Members extends readonly [AnyMinted, AnyMinted, ...Array<AnyMinted>]>(...members: Members) =>
  mint(S.Union(...members))

export const tuple = <Elements extends ReadonlyArray<AnyMinted>>(...elements: Elements) => mint(S.Tuple(...elements))

export const suspend = <A, I>(thunk: () => Minted<A, I>): Minted<A, I> => mint(S.suspend(thunk))

/** Constrain a member's values. Effect's own `member.pipe(Schema.minLength(1))` returns an unmarked schema. */
export const refine = <A, I>(
  member: Minted<A, I>,
  predicate: (a: A) => boolean,
  annotations?: S.Annotations.Filter<A>,
): Minted<A, I> => mint(S.filter<S.Schema<A, I>>(predicate, annotations)(member))

export type Fields = Record<string, MintedField>

export const wire = <F extends Fields>(fields: F): S.Struct<F> & Mark => mint(S.Struct(fields))
