/// <reference types="vitest/importMeta" />
import { it } from '@effect/vitest'
import { Schema as S } from 'effect'
import * as AST from 'effect/SchemaAST'
import { FastCheck as fc } from 'effect/testing'
import type { FastCheck } from 'effect/testing'
import { dischargedBy, obligationsOf, scanObligations } from './Refutation.js'
import type { Obligation } from './Refutation.js'
import { armsOf, unsupportedShapeOf } from './Weaken.js'

export type RefusalGenerators = Record<string, FastCheck.Arbitrary<unknown>>

export interface AdequacyReport {
  readonly adequate: boolean
  readonly undischarged: readonly Obligation[]
  readonly message: string
}

export const adequacyReport = (
  schema: Parameters<typeof S.is>[0] & { readonly ast: AST.AST },
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
        scan.blind.map((entry) => `  ${entry.message}`).join('\n'),
    }
  }
  if (undischarged.length === 0) {
    if (scan.obligations.size === 0) {
      return {
        adequate: true,
        undischarged,
        message: 'vacuous: schema has no refutation obligations; adequacy holds trivially',
      }
    }
    return { adequate: true, undischarged, message: '' }
  }
  const detail = undischarged
    .map((obligation) => `  ${obligation.tag} reached by [${obligation.paths.join(' | ')}]`)
    .join('\n')
  return {
    adequate: false,
    undischarged,
    message: `${undischarged.length} obligation(s) discharged by no declared generator:\n${detail}`,
  }
}

export const discriminates = (
  schema: Parameters<typeof S.is>[0],
  obligations: ReadonlyMap<AST.AST, Obligation>,
  value: unknown,
): boolean => {
  if (accepts(schema, value)) return false
  for (const obligation of obligations.values()) {
    if (accepts(S.make(obligation.weakened), value)) return true
  }
  return false
}

export const refutes = (
  schema: Parameters<typeof S.is>[0] & { readonly ast: AST.AST },
  generators: RefusalGenerators,
): void => {
  const obligations = obligationsOf(schema)
  const name = AST.resolveIdentifier(schema.ast) ?? String(schema.ast)
  for (const [generator, arbitrary] of Object.entries(generators)) {
    it.prop(`∀b_${generator}_⊥`, [arbitrary], ([value]) => !accepts(schema, value))
    it.prop(`∀g_${generator}_discriminates`, [arbitrary], ([value]) => discriminates(schema, obligations, value))
  }
  it.prop(`∀s_${name}_adequate`, [fc.constant(0)], ([_draw]) => adequacyReport(schema, generators).adequate)
}

const accepts = (schema: Parameters<typeof S.is>[0], value: unknown): boolean => S.is(schema)(value)

if (import.meta.vitest !== void 0) {
  const ProbeString = S.String.check(S.isMinLength(1)).pipe(S.annotate({ identifier: 'ProbeString' }))
  const RefinedHex = S.String.check(S.isPattern(/^[0-9a-f]*$/)).pipe(S.annotate({ identifier: 'RefinedHex' }))
  const BadHex = S.String.check(S.isPattern(/^[^0-9a-f]+$/)).pipe(S.annotate({ identifier: 'BadHex' }))
  const Plain = S.String.pipe(S.annotate({ identifier: 'Plain' }))
  const UnknownLike = S.Unknown.pipe(S.annotate({ identifier: 'UnknownLike' }))

  it.prop('∀x_Weaken_=Witness', [S.toArbitrary(ProbeString)(fc)], ([_draw]) => {
    const arms = armsOf(RefinedHex)
    if (arms.length === 0) return false
    const obligations = obligationsOf(RefinedHex)
    if (obligations.size === 0) return false
    const first = [...obligations.values()][0]
    if (first === undefined) return false
    const weakened = S.make(first.weakened)
    return accepts(weakened, first.witness) && !accepts(RefinedHex, first.witness)
  })

  it.prop('∀x_Refutes_∈Adequate', [S.toArbitrary(ProbeString)(fc)], ([_draw]) => {
    const badArb = S.toArbitrary(BadHex)(fc)
    const withRefusal = adequacyReport(RefinedHex, { BadHex: badArb })
    const withoutRefusal = adequacyReport(RefinedHex, {})
    return withRefusal.adequate && !withoutRefusal.adequate
  })

  it.prop('∀x_Vacuous_∈Empty', [S.toArbitrary(ProbeString)(fc)], ([_draw]) => {
    const arms = armsOf(Plain)
    const report = adequacyReport(Plain, {})
    return arms.length === 0 && report.adequate && report.message.includes('vacuous')
  })

  it.prop('∀x_Unknown_∈Route', [S.toArbitrary(ProbeString)(fc)], ([_draw]) => {
    const entry = unsupportedShapeOf(UnknownLike.ast)
    if (entry === undefined) return false
    return entry.coverageRoute.includes('U1')
  })
}
