/**
 * The wire alphabet — build a schema for a foreign payload out of members you declare, so no
 * vendor type can be named inside it.
 *
 * ```ts
 * import { Wire } from '@systemfsoftware/effect-cell-types'
 * import { Effect, Schema as S } from 'effect'
 *
 * const Invoice = Wire.wire({
 *   id: Wire.mint(S.String),
 *   amountDue: Wire.mint(S.NullOr(Wire.mint(S.Finite))),
 *   status: Wire.mint(S.Literals(['draft', 'open', 'paid'])),
 *   lineItems: Wire.mint(S.Array(Wire.mint(S.String))),
 *   metadata: Wire.mint(S.Record(Wire.mint(S.String), Wire.mint(S.String))),
 *   deleted: Wire.mint(S.optional(Wire.mint(S.Boolean))),
 * })
 *
 * // Decodes to your own type — `{ id: string; amountDue: number | null; ... }`.
 * const invoice = yield* Schema.decode(Invoice)(payload)
 * ```
 *
 * Only declarations that name members through {@link mint} are constrained, and mint admits a
 * foreign schema deliberately. It is a guardrail, not a security boundary.
 */
import { Schema as S } from 'effect'

/**
 * Marker a wire member carries once this workspace declares its type. The property type is the
 * fix, so the compiler diagnostic names it.
 *
 * It sits on the schema, never on the decoded value: `Schema.Type<typeof Wire.mint(S.String)>` is `string`.
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
 * Any marked struct member — a schema, or a property signature from `S.optional`.
 * The permissive `Constraint` arm rather than a narrower schema type, whose `never` variants
 * would fail the assignability check before the marker is reached, leaving the diagnostic to
 * report an unrelated type error.
 */
export type MintedField = S.Constraint & Mark

/**
 * Mark a member whose type this workspace declares.
 *
 * The value returned is the one passed in, and its concrete type is preserved, so a marked
 * struct stays a struct and Effect's inference keeps working. Reach for it to admit anything
 * the schema library can express, including a vendor's own schema — deliberately.
 */
export const mint = <Field extends S.Constraint>(field: Field): Field & Mark => {
  assertMinted(field)
  return field
}

// An `as` cast is what `typescript(no-unsafe-type-assertion)` refuses, so the narrowing goes
// through an assertion signature and the unchecked step stays in one empty-bodied function.
function assertMinted<Field extends S.Constraint>(_field: Field): asserts _field is Field & Mark {}

export type Fields = Record<string, MintedField>

export const wire = <F extends Fields>(fields: F): S.Struct<F> & Mark => mint(S.Struct(fields))
