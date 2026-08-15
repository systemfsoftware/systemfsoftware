/**
 * The wire alphabet — a declaration is built from members this workspace owns, so a foreign
 * contract has nothing to be.
 *
 * A wire declaration restates a foreign payload in primitives. Whether a type may be named there
 * is a property of that type's declaration site, so no filename-keyed rule can decide it: the
 * author who writes the violation is the author who names the file. A specifier-keyed rule cannot
 * decide it either — one workspace-local alias of a vendor type defeats the textual predicate.
 *
 * What decides it is the type. {@link mint} is the only door a mark enters by, every combinator
 * here takes marked inputs and returns marked outputs, and {@link wire} accepts nothing else. A
 * vendor type carries no mark and an alias of one confers none, so the refusal is a compile error
 * at the authoring site — and it travels to every consumer through the published `.d.ts`, which
 * is the one channel a library controls.
 *
 * The mark sits on the schema and never on the decoded value. A brand on the value forces
 * nothing: `Schema.make(x, true)` and a bare cast each mint a branded value with every refinement
 * skipped.
 *
 * One case this cannot refuse: calling {@link mint} on a foreign schema deliberately. Nothing in
 * the type system separates minting our own primitive from minting a vendor's shape. That
 * residual is a declaration-site question, answerable by a type checker and not by a type, and
 * `mint` is deliberately the single call site such a checker has to inspect.
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
 * `Schema` is invariant in its type parameters, so `Minted<unknown>` does not admit `Minted<A>`
 * and cannot serve as the upper bound. `Schema.Any` is the constraint Effect publishes for this.
 */
export type AnyMinted = S.Schema.Any & Mark

/**
 * Vouch for a schema whose type this workspace declares.
 *
 * This is the alphabet's trust boundary. Every combinator below composes marked inputs into
 * marked outputs, so a mark can only originate here, and applying this to a vendor's type is the
 * one bypass no type can see.
 *
 * The concrete schema type is preserved rather than flattened to {@link Minted}, so a marked
 * struct stays a struct and Effect's own inference keeps working through the alphabet.
 *
 * The narrowing goes through an assertion signature rather than an `as` cast, matching
 * `Workflow.make`: a narrowing assertion trips `typescript(no-unsafe-type-assertion)`, and a
 * suppression would hide the one place this file could lie. It is sound rather than merely
 * permitted — {@link Mark} is a phantom whose only member is a `declare`d unique symbol, so it
 * adds no property any caller can read, and the value handed back is the schema that came in.
 */
export const mint = <Schema extends S.Schema.Any>(schema: Schema): Schema & Mark => {
  assertMinted(schema)
  return schema
}

function assertMinted<Schema extends S.Schema.Any>(_schema: Schema): asserts _schema is Schema & Mark {}

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

/** An array of a marked member. */
export const array = <A, I>(member: Minted<A, I>): Minted<ReadonlyArray<A>, ReadonlyArray<I>> => mint(S.Array(member))

/** The fields a wire declaration may be built from: marked, every one of them. */
export type Fields = Record<string, AnyMinted>

/**
 * A wire declaration: a foreign payload restated in members this workspace owns.
 *
 * The parameter type is the enforcement. A field whose schema is a vendor type, an alias of one,
 * or any schema that never passed through {@link mint}, is a compile error here — reported at the
 * declaration rather than in a report a walker files afterwards.
 *
 * The result is itself marked, so declarations nest without leaving the alphabet.
 */
export const wire = <F extends Fields>(fields: F): S.Struct<F> & Mark => mint(S.Struct(fields))
