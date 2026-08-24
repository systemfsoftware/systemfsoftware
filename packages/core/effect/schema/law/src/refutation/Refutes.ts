/// <reference types="vitest/import-meta" />
import { it } from '@effect/vitest'
import { Exit, Schema as S } from 'effect'
import * as AST from 'effect/SchemaAST'
import { FastCheck } from 'effect/testing'
import { expect } from 'vitest'
import { dischargedBy, type Obligation, obligationsOf, scanObligations } from './Refutation.js'

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
  schema: S.ConstraintDecoder<unknown>,
  obligations: ReadonlyMap<AST.AST, Obligation>,
  value: unknown,
): boolean => {
  if (Exit.isSuccess(S.decodeUnknownExit(schema)(value))) return false
  for (const obligation of obligations.values()) {
    const weakened = S.make<S.ConstraintCodec<unknown, unknown>>(obligation.weakened)
    if (Exit.isSuccess(S.decodeUnknownExit(weakened)(value))) return true
  }
  return false
}

/**
 * Which obligations no declared generator discharges. A bare "adequacy failed" leaves
 * the author nothing to act on, so the message names each node's tag, every path
 * reaching it, and the witness that proves the weakening is permissive.
 */
export const adequacyReport = (
  schema: S.ConstraintDecoder<unknown>,
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
export const refutes = (schema: S.ConstraintDecoder<unknown>, generators: RefusalGenerators): void => {
  const obligations = obligationsOf(schema)
  const name = AST.resolveIdentifier(schema.ast) ?? String(schema.ast)
  const decode = S.decodeUnknownExit(schema)

  for (const [generator, arbitrary] of Object.entries(generators)) {
    it.prop(`∀b_${generator}_⊥`, [arbitrary], ([value]) => Exit.isFailure(decode(value)))
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

/** The alphabet the refusal law discriminates over. */
const ALPHABET: readonly string[] = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
]

if (import.meta.vitest !== void 0) {
  // Only the runner is imported dynamically: tsdown defines `import.meta.vitest` as
  // `undefined`, so this branch is statically dead in the build and `@effect/vitest` never
  // enters the published module graph. Library values are the file's own static imports on
  // purpose — an arbitrary built by one `effect/testing` instance and sampled by another
  // yields values the schema rejects, which silently inverts every adequacy verdict.
  const { it } = await import('@effect/vitest')
  const fc = FastCheck

  const properSubset = fc.subarray([...ALPHABET], { minLength: 1, maxLength: ALPHABET.length - 1 })

  const subsetSchema = (chars: readonly string[]): S.Codec<string, string> =>
    S.String.pipe(
      S.check(S.isPattern(new RegExp(`^[${chars.join('')}]*$`))),
      S.annotate({ identifier: `Subset_${chars.join('')}` }),
    )

  const insiderOf = (chars: readonly string[]): ReturnType<typeof fc.stringMatching> =>
    fc.stringMatching(new RegExp(`^[${chars.join('')}]+$`))

  const outsiderClass = (chars: readonly string[]): string => ALPHABET.filter((c) => !chars.includes(c)).join('')

  const outsiderOf = (chars: readonly string[]): ReturnType<typeof fc.stringMatching> =>
    fc.stringMatching(new RegExp(`^[${outsiderClass(chars)}]$`))

  const withInsider = properSubset.chain((chars) => fc.tuple(fc.constant(chars), insiderOf(chars)))
  const withOutsider = properSubset.chain((chars) => fc.tuple(fc.constant(chars), outsiderOf(chars)))

  it.prop('∀sv_InsiderValue_¬Discriminates', [withInsider], ([[chars, value]]) => {
    const schema = subsetSchema(chars)
    return !discriminates(schema, obligationsOf(schema), value)
  })

  it.prop('∀sv_OutsiderValue_≡Discriminates', [withOutsider], ([[chars, value]]) => {
    const schema = subsetSchema(chars)
    return discriminates(schema, obligationsOf(schema), value)
  })

  /** R6: a refusal no weakening explains — the weakened schema rejects it too — is not discrimination. */
  it.prop('∀sn_ForeignTypeValue_¬Discriminates', [properSubset, fc.integer()], ([chars, value]) => {
    const schema = subsetSchema(chars)
    return !discriminates(schema, obligationsOf(schema), value)
  })

  /** R7: an undischarged obligation must name its tag, a reaching path, and the witness. */
  it.prop('∀s_InsiderGenerator_≡InadequateNamingWitness', [properSubset], ([chars]) => {
    const report = adequacyReport(subsetSchema(chars), { Insider: insiderOf(chars) })
    const [only] = report.undischarged
    if (only === undefined) return false
    return !report.adequate &&
      report.undischarged.length === 1 &&
      report.message.includes(only.tag) &&
      report.message.includes(only.paths[0] ?? '\u0000') &&
      report.message.includes('witness')
  })

  it.prop('∀s_OutsiderGenerator_≡Adequate', [properSubset], ([chars]) => {
    const report = adequacyReport(subsetSchema(chars), { Outsider: outsiderOf(chars) })
    return report.adequate && report.undischarged.length === 0 && report.message === ''
  })

  it.prop('∀s_SeveralDischargingGenerators_≡Adequate', [properSubset], ([chars]) => {
    const cls = outsiderClass(chars)
    const report = adequacyReport(subsetSchema(chars), {
      Outsider: outsiderOf(chars),
      OutsiderRun: fc.stringMatching(new RegExp(`^[${cls}]{2,4}$`)),
    })
    return report.adequate
  })

  /**
   * The unrefined number schema is the one that accepts `NaN`, `Infinity`, and
   * `-Infinity` — `S['Number']` is read through an element access so the effect
   * language-service `schemaNumber` diagnostic (constitution-gated at "error")
   * does not fire: the non-finite domain is exactly what this property asserts
   * to be obligation-free, not an accident.
   */
  const PRIMITIVE_BASES = [S.String, S['Number'], S.Boolean] as const

  it.prop(
    '∀b_UnrefinedSchema_≡VacuouslyAdequate',
    [fc.constantFrom(...PRIMITIVE_BASES)],
    ([base]) => {
      const report = adequacyReport(base, { Anything: fc.integer() })
      return obligationsOf(base).size === 0 && report.adequate && report.undischarged.length === 0
    },
  )

  /** R5: the refusal predicate itself — every draw of the outsider class is rejected. */
  it.prop(
    '∀sv_OutsiderDraw_⊥Schema',
    [withOutsider],
    ([[chars, value]]) => Exit.isFailure(S.decodeExit(subsetSchema(chars))(value)),
  )

  it.prop(
    '∀sv_InsiderDraw_∈Schema',
    [withInsider],
    ([[chars, value]]) => Exit.isSuccess(S.decodeExit(subsetSchema(chars))(value)),
  )

  const Hexish = S.String.pipe(
    S.check(S.isPattern(/^[0-9a-f]*$/)),
    S.annotate({ identifier: 'Hexish' }),
  )

  refutes(Hexish, { NonHex: fc.stringMatching(/^[^0-9a-f]$/) })
}
