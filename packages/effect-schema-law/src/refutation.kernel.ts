import { Exit, Option, Result, Schema as S } from 'effect'
import * as AST from 'effect/SchemaAST'
import { FastCheck } from 'effect/testing'
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

type NamedArbitrary = FastCheck.Arbitrary<unknown>

const REJECTION_GENERIC_POOL: readonly unknown[] = [
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
const accepts = (schema: S.ConstraintDecoder<unknown>, value: unknown): boolean =>
  Exit.isSuccess(S.decodeUnknownExit(schema)(value))

const buildArbitrary = (schema: S.ConstraintDecoder<unknown>): NamedArbitrary | undefined => {
  try {
    return S.toArbitrary(schema)(FastCheck)
  } catch {
    return undefined
  }
}

const sample = (
  arbitrary: NamedArbitrary,
  budget: number,
): readonly unknown[] | undefined => {
  try {
    return FastCheck.sample(arbitrary, { numRuns: budget, seed: 1 })
  } catch {
    return undefined
  }
}

const findWitness = (
  schema: S.ConstraintDecoder<unknown>,
  arm: Arm,
): Result.Result<Option.Option<unknown>, BlindArm> => {
  const weakened = S.make<S.ConstraintCodec<unknown, unknown>>(arm.weakened)
  const isWitness = (value: unknown): boolean => accepts(weakened, value) && !accepts(schema, value)

  let schemaDerivedDraws = 0
  for (const source of [S.toEncoded(weakened), weakened]) {
    const arbitrary = buildArbitrary(source)
    if (arbitrary === undefined) continue
    const draws = sample(arbitrary, WITNESS_BUDGET)
    if (draws === undefined) continue
    schemaDerivedDraws += draws.length
    for (const value of draws) {
      if (isWitness(value)) return Result.succeed(Option.some(value))
    }
  }

  for (const value of REJECTION_GENERIC_POOL) {
    if (isWitness(value)) return Result.succeed(Option.some(value))
  }

  if (schemaDerivedDraws === 0) {
    return Result.fail({
      path: arm.path,
      kind: arm.kind,
      message: `refutation.kernel: witness search failed for arm "${arm.path}" (${arm.kind}); ` +
        `neither the encoded nor the type arbitrary of the weakened schema yielded a draw, ` +
        `so "no obligation" cannot be distinguished from "could not look".`,
    })
  }

  return Result.succeed(Option.none())
}

/**
 * Walk `armsOf` and classify every arm. An arm is an obligation iff a witness
 * exists — an input the weakened schema accepts and the original rejects —
 * drawn from a fallback chain (encoded arbitrary, type arbitrary, generic
 * pool). An arm whose every source failed to construct is `blind`: "no
 * obligation" and "could not look" are different answers, and collapsing
 * them is the silent miss this scan exists to prevent.
 */
export const scanObligations = (schema: S.ConstraintDecoder<unknown>): ObligationScan => {
  const collected = new Map<AST.AST, { paths: string[]; witness: unknown; weakened: AST.AST }>()
  const blind: BlindArm[] = []

  for (const arm of armsOf(schema)) {
    const found = findWitness(schema, arm)
    if (Result.isFailure(found)) {
      blind.push(found.failure)
      continue
    }
    if (Option.isNone(found.success)) continue

    const existing = collected.get(arm.node)
    if (existing === undefined) {
      collected.set(arm.node, { paths: [arm.path], witness: found.success.value, weakened: arm.weakened })
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

export const obligationsOf = (schema: S.ConstraintDecoder<unknown>): ReadonlyMap<AST.AST, Obligation> =>
  scanObligations(schema).obligations

const discharges = (
  schema: S.ConstraintDecoder<unknown>,
  arbitrary: NamedArbitrary,
  obligation: Obligation,
): boolean => {
  const weakened = S.make<S.ConstraintCodec<unknown, unknown>>(obligation.weakened)
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
  schema: S.ConstraintDecoder<unknown>,
  obligations: ReadonlyMap<AST.AST, Obligation>,
  generators: Readonly<Record<string, NamedArbitrary>>,
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

/** Draws per refutable schema in the law below. */
const DRAWS_PER_SCHEMA = 8

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { it } = await import('@effect/vitest')
  const { Schema: S } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')

  // Fixture schemas stay inside the block so they never reach
  // schema-declaration-location's module-scope arm.
  const Hexish = S.String.pipe(
    S.check(S.isPattern(/^[0-9a-f]*$/)),
    S.annotate({ identifier: 'Hexish' }),
  )

  const Slug = S.String.pipe(
    S.check(S.isPattern(/^[a-z][a-z0-9-]*$/)),
    S.annotate({ identifier: 'Slug' }),
  )

  const Port = S.Finite.pipe(
    S.check(S.isBetween({ minimum: 1, maximum: 65535 })),
    S.annotate({ identifier: 'Port' }),
  )

  const NonEmpty = S.String.pipe(S.check(S.isMinLength(1)), S.annotate({ identifier: 'NonEmpty' }))

  const Endpoint = S.Struct({ host: Hexish, port: Port })

  const Routing = S.Union([
    S.TaggedStruct('Local', { slug: Slug }),
    S.TaggedStruct('Remote', { endpoint: Endpoint }),
  ])

  const Listing = S.Struct({ slugs: S.Array(Slug), label: NonEmpty })

  const REFUTABLE_SCHEMAS: readonly S.Codec<unknown, unknown>[] = [
    Hexish,
    Slug,
    Port,
    NonEmpty,
    Endpoint,
    Routing,
    Listing,
  ]

  const SCHEMA_DRAWS = REFUTABLE_SCHEMAS.length * DRAWS_PER_SCHEMA

  it.prop(
    '∀r_EachWitness_≡DischargesItsOwnArm',
    [fc.constantFrom(...REFUTABLE_SCHEMAS)],
    ([schema]) => {
      const obligations = obligationsOf(schema)
      if (obligations.size === 0) return false
      const accepted = S.toArbitrary(schema)(fc)
      return [...obligations.entries()].every(([node, obligation]) => {
        const credits = dischargedBy(schema, new Map([[node, obligation]]), {
          W: fc.constant(obligation.witness),
          ACCEPTED: accepted,
        })
        const discharging = credits.get(node) ?? []
        return discharging.includes('W') && !discharging.includes('ACCEPTED')
      })
    },
    { fastCheck: { numRuns: SCHEMA_DRAWS } },
  )
}
