import { it } from '@effect/vitest'
import { Either, Option, Schema as S } from 'effect'
import * as AST from 'effect/SchemaAST'
import { expect } from 'vitest'
import { discriminates, obligationsOf, type RefusalGenerators } from './refutation.kernel.js'
import { adequacyReport } from './weaken.kernel.js'

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
