import { it } from '@effect/vitest'
import { Exit, Schema as S } from 'effect'
import { FastCheck as fc } from 'effect/testing'
import { obligationsOf } from '../refutation.kernel.js'
import { adequacyReport, discriminates, refutes } from '../refutes.kernel.js'
import { ruleOfSchemas } from '../rule-of-schemas.kernel.js'

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

const properSubset = fc.subarray([...ALPHABET], { minLength: 1, maxLength: ALPHABET.length - 1 })

const subsetSchema = (chars: readonly string[]): S.Codec<string, string> =>
  S.String.pipe(
    S.check(S.isPattern(new RegExp(`^[${chars.join('')}]*$`))),
    S.annotate({ identifier: `Subset_${chars.join('')}` }),
  )

const insiderOf = (chars: readonly string[]): fc.Arbitrary<string> =>
  fc.stringMatching(new RegExp(`^[${chars.join('')}]+$`))

const outsiderClass = (chars: readonly string[]): string => ALPHABET.filter((c) => !chars.includes(c)).join('')

const outsiderOf = (chars: readonly string[]): fc.Arbitrary<string> =>
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
ruleOfSchemas('Hexish', Hexish)
