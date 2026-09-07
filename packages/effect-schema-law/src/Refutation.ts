import { Option, Result, Schema } from 'effect'
import * as AST from 'effect/SchemaAST'
import { FastCheck } from 'effect/testing'
import { armsOf } from './Weaken.js'

export interface Obligation {
  readonly node: AST.AST
  readonly tag: string
  readonly paths: readonly string[]
  readonly weakened: AST.AST
  readonly witness: unknown
}

export interface BlindArm {
  readonly path: string
  readonly kind: string
  readonly message: string
}

export interface ObligationScan {
  readonly obligations: ReadonlyMap<AST.AST, Obligation>
  readonly blind: readonly BlindArm[]
  readonly warnings: readonly string[]
}

export type NamedArbitrary = FastCheck.Arbitrary<unknown>

export const WITNESS_BUDGET = 256

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

const accepts = (schema: Parameters<typeof Schema.is>[0], value: unknown): boolean => Schema.is(schema)(value)

const buildArbitrary = (schema: Parameters<typeof Schema.toArbitrary>[0]): FastCheck.Arbitrary<unknown> | undefined => {
  try {
    return Schema.toArbitrary(schema)(FastCheck)
  } catch {
    return undefined
  }
}

const sample = (
  arbitrary: FastCheck.Arbitrary<unknown>,
  budget: number,
): ReadonlyArray<unknown> | undefined => {
  try {
    return FastCheck.sample(arbitrary, { numRuns: budget, seed: 1 })
  } catch {
    return undefined
  }
}

const nodeTagOf = (ast: AST.AST): string => {
  if (AST.isDeclaration(ast)) return 'Declaration'
  if (AST.isSuspend(ast)) return 'Suspend'
  if (AST.isUnion(ast)) return 'Union'
  if (AST.isObjects(ast)) return 'Objects'
  if (AST.isArrays(ast)) return 'Arrays'
  if (AST.isTemplateLiteral(ast)) return 'TemplateLiteral'
  if (AST.isUnknown(ast)) return 'Unknown'
  return 'AST'
}

const findWitness = (
  schema: Parameters<typeof Schema.is>[0],
  arm: { readonly path: string; readonly kind: string; readonly weakened: AST.AST },
): Result.Result<Option.Option<unknown>, BlindArm> => {
  const weakened = Schema.make(arm.weakened)
  const isWitness = (value: unknown): boolean => accepts(weakened, value) && !accepts(schema, value)
  let schemaDerivedDraws = 0
  const sources = [Schema.toEncoded(weakened), weakened] as const
  for (const source of sources) {
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
      message:
        `refutation: witness search failed for arm "${arm.path}" (${arm.kind}); neither the encoded nor the type arbitrary of the weakened schema yielded a draw, so "no obligation" cannot be distinguished from "could not look".`,
    })
  }
  return Result.succeed(Option.none())
}

const scanUncached = (schema: Parameters<typeof Schema.is>[0] & { readonly ast: AST.AST }): ObligationScan => {
  const collected = new Map<
    AST.AST,
    { readonly paths: string[]; readonly witness: unknown; readonly weakened: AST.AST }
  >()
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
      tag: nodeTagOf(node),
      paths: entry.paths,
      weakened: entry.weakened,
      witness: entry.witness,
    })
  }
  const warnings: string[] = []
  if (armsOf(schema).length > 0 && obligations.size === 0 && blind.length === 0) {
    const label = AST.resolveIdentifier(schema.ast) ?? nodeTagOf(schema.ast)
    warnings.push(
      `refutation: schema "${label}" has arms but no obligations; the witness search came up empty where it should not have`,
    )
  }
  return { obligations, blind, warnings }
}

const scanCache = new WeakMap<object, ObligationScan>()

export const scanObligations = (
  schema: Parameters<typeof Schema.is>[0] & { readonly ast: AST.AST },
): ObligationScan => {
  const cached = scanCache.get(schema)
  if (cached !== undefined) return cached
  const fresh = scanUncached(schema)
  scanCache.set(schema, fresh)
  return fresh
}

export const obligationsOf = (
  schema: Parameters<typeof Schema.is>[0] & { readonly ast: AST.AST },
): ReadonlyMap<AST.AST, Obligation> => scanObligations(schema).obligations

const discharges = (
  schema: Parameters<typeof Schema.is>[0],
  arbitrary: NamedArbitrary,
  obligation: Obligation,
): boolean => {
  const weakened = Schema.make(obligation.weakened)
  const draws = sample(arbitrary, WITNESS_BUDGET)
  if (draws === undefined) return false
  for (const value of draws) {
    if (accepts(weakened, value) && !accepts(schema, value)) return true
  }
  return false
}

export const dischargedBy = (
  schema: Parameters<typeof Schema.is>[0] & { readonly ast: AST.AST },
  obligations: ReadonlyMap<AST.AST, Obligation>,
  generators: Readonly<Record<string, NamedArbitrary>>,
): ReadonlyMap<AST.AST, readonly string[]> => {
  const out = new Map<AST.AST, readonly string[]>()
  for (const [node, obligation] of obligations) {
    const discharging: string[] = []
    for (const [name, arbitrary] of Object.entries(generators)) {
      if (discharges(schema, arbitrary, obligation)) discharging.push(name)
    }
    out.set(node, discharging)
  }
  return out
}
