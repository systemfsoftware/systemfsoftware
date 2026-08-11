import { Either, type FastCheck, FastCheck as fc, Option, Schema as S } from 'effect'
import * as Arbitrary from 'effect/Arbitrary'
import * as AST from 'effect/SchemaAST'
import { type Arm, armsOf } from './weaken.kernel.js'

/**
 * One node-keyed refutation obligation: a witness exists that the
 * weakened schema accepts and the original rejects. Obligations are
 * keyed by the AST node the arm removes (R3); several paths reaching
 * one node are one obligation carrying several paths.
 */
export interface Obligation {
  readonly node: AST.AST
  readonly tag: string
  readonly paths: readonly string[]
  readonly weakened: AST.AST
  readonly witness: unknown
}

/** An arm no source could draw for: the search could not look, which is not the same as finding nothing. */
export interface BlindArm {
  readonly path: string
  readonly kind: string
  readonly message: string
}

/** Every arm of a schema, split into the ones a witness proved and the ones nothing could see. */
export interface ObligationScan {
  readonly obligations: ReadonlyMap<AST.AST, Obligation>
  readonly blind: readonly BlindArm[]
}

/**
 * The sampling budget is a property of the contract, not a knob. The
 * plan pins the expectation against a literal table; the kernel draws
 * up to this many candidates per source before exhausting the chain.
 */
export const WITNESS_BUDGET = 256

const REJECTION_GENERIC_POOL: ReadonlyArray<unknown> = [
  '',
  ' ',
  'g',
  '0',
  '1',
  -1,
  0,
  1,
  true,
  false,
  null,
  undefined,
  {},
  [],
  { _: 'unknown' },
  ['unknown'],
  Number.NaN,
  Number.POSITIVE_INFINITY,
  'not-a-date',
]

/** Decode-side, not validate-side: refusal generators draw wire-form inputs, so this is a question about the Encoded side. */
const accepts = (schema: S.Schema.AnyNoContext, value: unknown): boolean =>
  Either.isRight(S.decodeUnknownEither(schema)(value))

const buildArbitrary = (schema: S.Schema.AnyNoContext): FastCheck.Arbitrary<unknown> | undefined => {
  try {
    return Arbitrary.make(schema)
  } catch {
    return undefined
  }
}

const sample = (
  arbitrary: FastCheck.Arbitrary<unknown>,
  budget: number,
): ReadonlyArray<unknown> | undefined => {
  try {
    return fc.sample(arbitrary, { numRuns: budget, seed: 1 })
  } catch {
    return undefined
  }
}

const findWitness = (
  schema: S.Schema.AnyNoContext,
  arm: Arm,
): Either.Either<Option.Option<unknown>, BlindArm> => {
  const weakened = S.make(arm.weakened)
  const isWitness = (value: unknown): boolean => accepts(weakened, value) && !accepts(schema, value)

  let schemaDerivedDraws = 0
  for (const source of [S.encodedSchema(weakened), weakened]) {
    const arbitrary = buildArbitrary(source)
    if (arbitrary === undefined) continue
    const draws = sample(arbitrary, WITNESS_BUDGET)
    if (draws === undefined) continue
    schemaDerivedDraws += draws.length
    for (const value of draws) {
      if (isWitness(value)) return Either.right(Option.some(value))
    }
  }

  for (const value of REJECTION_GENERIC_POOL) {
    if (isWitness(value)) return Either.right(Option.some(value))
  }

  if (schemaDerivedDraws === 0) {
    return Either.left({
      path: arm.path,
      kind: arm.kind,
      message: `refutation.kernel: witness search failed for arm "${arm.path}" (${arm.kind}); ` +
        `neither the encoded nor the type arbitrary of the weakened schema yielded a draw, ` +
        `so "no obligation" cannot be distinguished from "could not look".`,
    })
  }

  return Either.right(Option.none())
}

/**
 * Walk `armsOf` and classify every arm. An arm is an obligation iff a witness
 * exists — an input the weakened schema accepts and the original rejects —
 * drawn from a fallback chain (encoded arbitrary, type arbitrary, generic
 * pool). An arm whose every source failed to construct is `blind`: "no
 * obligation" and "could not look" are different answers, and collapsing
 * them is the silent miss this scan exists to prevent.
 */
export const scanObligations = (schema: S.Schema.AnyNoContext): ObligationScan => {
  const collected = new Map<AST.AST, { paths: string[]; witness: unknown; weakened: AST.AST }>()
  const blind: BlindArm[] = []

  for (const arm of armsOf(schema)) {
    const found = findWitness(schema, arm)
    if (Either.isLeft(found)) {
      blind.push(found.left)
      continue
    }
    if (Option.isNone(found.right)) continue

    const existing = collected.get(arm.node)
    if (existing === undefined) {
      collected.set(arm.node, { paths: [arm.path], witness: found.right.value, weakened: arm.weakened })
    } else {
      existing.paths.push(arm.path)
    }
  }

  const obligations = new Map<AST.AST, Obligation>()
  for (const [node, entry] of collected) {
    obligations.set(node, {
      node,
      tag: node._tag,
      paths: entry.paths,
      weakened: entry.weakened,
      witness: entry.witness,
    })
  }
  return { obligations, blind }
}

export const obligationsOf = (schema: S.Schema.AnyNoContext): ReadonlyMap<AST.AST, Obligation> =>
  scanObligations(schema).obligations

const discharges = (
  schema: S.Schema.AnyNoContext,
  arbitrary: FastCheck.Arbitrary<unknown>,
  obligation: Obligation,
): boolean => {
  const weakened = S.make(obligation.weakened)
  const draws = sample(arbitrary, WITNESS_BUDGET)
  if (draws === undefined) return false
  for (const value of draws) {
    if (accepts(weakened, value) && !accepts(schema, value)) return true
  }
  return false
}

/**
 * For each obligation, return the names of the generators whose draws
 * the weakened schema accepts AND the original rejects. Generators
 * whose draws the original also accepts do not discharge — they are
 * the language the original already covers. Generators whose draws
 * the weakened schema rejects do not discharge either.
 *
 * The original schema is part of the signature because discharge is
 * defined relative to it.
 */
export const dischargedBy = (
  schema: S.Schema.AnyNoContext,
  obligations: ReadonlyMap<AST.AST, Obligation>,
  generators: Readonly<Record<string, FastCheck.Arbitrary<unknown>>>,
): ReadonlyMap<AST.AST, readonly string[]> => {
  const out = new Map<AST.AST, string[]>()
  for (const [node, obligation] of obligations) {
    const discharging: string[] = []
    for (const [name, arbitrary] of Object.entries(generators)) {
      if (discharges(schema, arbitrary, obligation)) {
        discharging.push(name)
      }
    }
    out.set(node, discharging)
  }
  return out
}

/** Named refusal generators: each draws rejection-class inputs the schema must reject. */
export type RefusalGenerators = Record<string, FastCheck.Arbitrary<unknown>>

/** True when `value` is a witness for some obligation: accepted by that weakening, rejected by the schema. */
export const discriminates = (
  schema: S.Schema.AnyNoContext,
  obligations: ReadonlyMap<AST.AST, Obligation>,
  value: unknown,
): boolean => {
  if (Either.isRight(S.decodeUnknownEither(schema)(value))) return false
  for (const obligation of obligations.values()) {
    if (Either.isRight(S.decodeUnknownEither(S.make(obligation.weakened))(value))) return true
  }
  return false
}

/** Verdict for one schema's obligation set: what went undischarged, and what could not be searched. */
export interface AdequacyReport {
  readonly adequate: boolean
  readonly undischarged: readonly Obligation[]
  readonly blind: readonly BlindArm[]
}

/** Which obligations no declared generator discharges. Rendering the verdict belongs to the caller. */
export const adequacyReport = (
  schema: S.Schema.AnyNoContext,
  generators: RefusalGenerators,
): AdequacyReport => {
  const scan = scanObligations(schema)
  const credits = dischargedBy(schema, scan.obligations, generators)
  const undischarged = [...scan.obligations.values()].filter(
    (obligation) => (credits.get(obligation.node) ?? []).length === 0,
  )
  return {
    adequate: scan.blind.length === 0 && undischarged.length === 0,
    undischarged,
    blind: scan.blind,
  }
}
