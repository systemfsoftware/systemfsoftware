import { it } from '@effect/vitest'
import { Either, type FastCheck, Option, Schema as S } from 'effect'
import * as AST from 'effect/SchemaAST'
import { expect } from 'vitest'
import { dischargedBy, type Obligation, obligationsOf, scanObligations } from './refutation.kernel.js'

/** Named refusal generators: each draws rejection-class inputs the schema must reject. */
export type RefusalGenerators = Record<string, FastCheck.Arbitrary<unknown>>

/** Verdict for one schema's obligation set, carrying the detail R7 requires in a failure. */
export interface AdequacyReport {
  readonly adequate: boolean
  readonly undischarged: readonly Obligation[]
  readonly message: string
}

const renderWitness = (witness: unknown): string => {
  try {
    return JSON.stringify(witness) ?? String(witness)
  } catch {
    return String(witness)
  }
}

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

/**
 * Which obligations no declared generator discharges. A bare "adequacy failed" leaves
 * the author nothing to act on, so the message names each node's tag, every path
 * reaching it, and the witness that proves the weakening is permissive.
 */
export const adequacyReport = (
  schema: S.Schema.AnyNoContext,
  generators: RefusalGenerators,
): AdequacyReport => {
  const scan = scanObligations(schema)
  const credits = dischargedBy(schema, scan.obligations, generators)
  const undischarged = [...scan.obligations.values()].filter(
    (obligation) => (credits.get(obligation.node) ?? []).length === 0,
  )
  if (scan.blind.length > 0) {
    return {
      adequate: false,
      undischarged,
      message: `${scan.blind.length} arm(s) could not be searched for a witness:\n` +
        scan.blind.map((b) => `  ${b.message}`).join('\n'),
    }
  }
  if (undischarged.length === 0) return { adequate: true, undischarged, message: '' }

  const detail = undischarged
    .map((o) => `  ${o.tag} reached by [${o.paths.join(' | ')}] — witness ${renderWitness(o.witness)}`)
    .join('\n')
  return {
    adequate: false,
    undischarged,
    message: `${undischarged.length} obligation(s) discharged by no declared generator:\n${detail}`,
  }
}

/**
 * Property-test one schema's rejection contract. Registers per generator a refusal
 * property (the schema rejects every draw) and a discrimination property (each draw is
 * explained by some weakening), plus one adequacy property for the schema.
 *
 * Names follow the house convention: `∀b_<generator>_⊥`, `∀g_<generator>_discriminates`,
 * `∀s_<schema>_adequate` — disjoint from `ruleOfSchemas`' `∀x_<name>_=x` pair.
 */
export const refutes = (schema: S.Schema.AnyNoContext, generators: RefusalGenerators): void => {
  const obligations = obligationsOf(schema)
  const name = Option.getOrElse(AST.getIdentifierAnnotation(schema.ast), () => String(schema.ast))
  const decode = S.decodeUnknownEither(schema)

  for (const [generator, arbitrary] of Object.entries(generators)) {
    it.prop(`∀b_${generator}_⊥`, [arbitrary], ([value]) => Either.isLeft(decode(value)))
    it.prop(
      `∀g_${generator}_discriminates`,
      [arbitrary],
      ([value]) => discriminates(schema, obligations, value),
    )
  }

  it('∀s_' + name + '_adequate', () => {
    const report = adequacyReport(schema, generators)
    expect(report.message).toBe('')
  })
}
