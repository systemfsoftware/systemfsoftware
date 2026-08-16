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

/**
 * A schema this workspace declares the type of. In v4 the encoded side lives on the schema
 * itself, so the second parameter is carried for API stability rather than as a separate
 * type argument: `Minted<A, I>` reads "decodes `A` from the wire's `I`-shaped payload".
 */
export type Minted<A, I = A> = S.Codec<A, I> & Mark

/** Any marked schema, for constraint positions. */
export type AnyMinted = S.Top & Mark

/**
 * Any marked struct member — a schema, or a property signature from {@link optional}.
 *
 * The permissive `Constraint` arm rather than a narrower schema type, whose `never` variants
 * would fail the assignability check before the marker is reached, leaving the diagnostic to
 * report an unrelated type error.
 */
export type MintedField = S.Constraint & Mark

/**
 * Mark a member whose type this workspace declares.
 *
 * Prefer the alphabet below; reach for this only to admit a schema the alphabet cannot express,
 * including a vendor's own. The value returned is the one passed in, and its concrete type is
 * preserved, so a marked struct stays a struct and Effect's inference keeps working.
 */
export const mint = <Field extends S.Constraint>(field: Field): Field & Mark => {
  assertMinted(field)
  return field
}

// An `as` cast is what `typescript(no-unsafe-type-assertion)` refuses, so the narrowing goes
// through an assertion signature and the unchecked step stays in one empty-bodied function.
function assertMinted<Field extends S.Constraint>(_field: Field): asserts _field is Field & Mark {}

// No return annotation on the alphabet values: the v4 record-key protocol and the schema
// methods read the member's concrete type, and an annotation to `Minted<...>` would widen it
// past what `S.Record` accepts as a key schema. The `Minted` alias still names every member's
// contract; the concrete type is what makes the alphabet compose.
export const string = mint(S.String)
export const number = mint(S.Finite)
export const boolean = mint(S.Boolean)
export const integer = mint(S.Int)

export const literal = <const Literals extends ReadonlyArray<SchemaAST.LiteralValue>>(
  ...literals: Literals
) => mint(S.Literals(literals))

export const nullOr = <A, I>(member: Minted<A, I>): Minted<A | null, I | null> => mint(S.NullOr(member))

export const undefinedOr = <A, I>(member: Minted<A, I>): Minted<A | undefined, I | undefined> =>
  mint(S.UndefinedOr(member))

export const nullishOr = <A, I>(member: Minted<A, I>): Minted<A | null | undefined, I | null | undefined> =>
  mint(S.NullishOr(member))

export const array = <A, I>(member: Minted<A, I>): Minted<ReadonlyArray<A>, ReadonlyArray<I>> => mint(S.Array(member))

/** A field that may be absent from the payload entirely, as distinct from present and `undefined`. */
export const optional = <Member extends AnyMinted>(member: Member) => mint(S.optional(member))

export const record = <K extends S.Record.Key & Mark, V extends AnyMinted>(key: K, value: V) =>
  mint(S.Record(key, value))

export const union = <Members extends readonly [AnyMinted, AnyMinted, ...Array<AnyMinted>]>(...members: Members) =>
  mint(S.Union(members))

export const tuple = <Elements extends ReadonlyArray<AnyMinted>>(...elements: Elements) => mint(S.Tuple(elements))

export const suspend = <A, I>(thunk: () => Minted<A, I>): Minted<A, I> => mint(S.suspend(thunk))

/**
 * Constrain a member's values. Effect's own `member.pipe(Schema.check(Schema.isMinLength(1)))`
 * preserves the mark, but returns the schema with the concrete decode/encode pair fused; this
 * combinator is the alphabet's own shape for the same operation, so a refined member keeps the
 * declaration this workspace makes of its type.
 *
 * `S.refine` needs a type-guard as its predicate argument; the workspace's predicate is a plain
 * `(a: A) => boolean` that narrows nothing, so a truth-preserving `value is A` guard is written
 * at this one call site rather than widening the public signature.
 */
export const refine = <A, I>(
  member: Minted<A, I>,
  predicate: (a: A) => boolean,
  annotations?: S.Annotations.Filter,
): Minted<A, I> =>
  mint(
    S.refine<Minted<A, I>, A>(
      (value): value is A => predicate(value),
      annotations,
    )(member),
  )

export type Fields = Record<string, MintedField>

export const wire = <F extends Fields>(fields: F): S.Struct<F> & Mark => mint(S.Struct(fields))
