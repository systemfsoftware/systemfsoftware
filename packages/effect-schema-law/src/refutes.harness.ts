import { it } from '@effect/vitest'
import { Either, Option, Schema as S } from 'effect'
import { toStringUnknown } from 'effect/Inspectable'
import * as AST from 'effect/SchemaAST'
import { expect } from 'vitest'
import {
  type AdequacyReport,
  adequacyReport,
  discriminates,
  obligationsOf,
  type RefusalGenerators,
} from './refutation.kernel.js'

/**
 * Injective over the rejection pool, which no single renderer manages: `JSON.stringify`
 * collapses `NaN`, `Infinity` and `null` onto one `null` and throws on a BigInt, while
 * `toStringUnknown` prints a string unquoted and collapses `'0'` onto `0`. Splitting on
 * `string` takes the half each gets right. Naming the wrong witness is worse than none.
 */
const renderWitness = (witness: unknown): string =>
  typeof witness === 'string' ? JSON.stringify(witness) : toStringUnknown(witness, 0)

const renderAdequacy = (report: AdequacyReport): string => {
  if (report.blind.length > 0) {
    return `${report.blind.length} arm(s) could not be searched for a witness:\n` +
      report.blind.map((b) => `  ${b.message}`).join('\n')
  }
  if (report.undischarged.length === 0) return ''
  const detail = report.undischarged
    .map((o) => `  ${o.tag} reached by [${o.paths.join(' | ')}] — witness ${renderWitness(o.witness)}`)
    .join('\n')
  return `${report.undischarged.length} obligation(s) discharged by no declared generator:\n${detail}`
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
    expect(renderAdequacy(adequacyReport(schema, generators))).toBe('')
  })
}
