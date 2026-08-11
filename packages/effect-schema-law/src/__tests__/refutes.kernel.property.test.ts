import { it } from '@effect/vitest'
import { Either, FastCheck as fc, Schema as S } from 'effect'
import { adequacyReport, discriminates, obligationsOf } from '../refutation.kernel.js'
import { refutes } from '../refutes.harness.js'
import { ruleOfSchemas } from '../rule-of-schemas.harness.js'

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

const subsetSchema = (chars: readonly string[]): S.Schema<string, string, never> =>
  S.String.pipe(
    S.pattern(new RegExp(`^[${chars.join('')}]*$`)),
    S.annotations({ identifier: `Subset_${chars.join('')}` }),
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

/** R7: an undischarged obligation must carry a reaching path and a genuine witness — one the
 * weakened schema accepts and the original rejects. */
it.prop('∀s_InsiderGenerator_≡InadequateCarryingWitness', [properSubset], ([chars]) => {
  const report = adequacyReport(subsetSchema(chars), { Insider: insiderOf(chars) })
  const [only] = report.undischarged
  if (only === undefined) return false
  return !report.adequate &&
    report.undischarged.length === 1 &&
    report.blind.length === 0 &&
    only.paths.length > 0 &&
    Either.isRight(S.decodeUnknownEither(S.make(only.weakened))(only.witness)) &&
    Either.isLeft(S.decodeUnknownEither(subsetSchema(chars))(only.witness))
})

it.prop('∀s_OutsiderGenerator_≡Adequate', [properSubset], ([chars]) => {
  const report = adequacyReport(subsetSchema(chars), { Outsider: outsiderOf(chars) })
  return report.adequate && report.undischarged.length === 0 && report.blind.length === 0
})

it.prop('∀s_SeveralDischargingGenerators_≡Adequate', [properSubset], ([chars]) => {
  const cls = outsiderClass(chars)
  const report = adequacyReport(subsetSchema(chars), {
    Outsider: outsiderOf(chars),
    OutsiderRun: fc.stringMatching(new RegExp(`^[${cls}]{2,4}$`)),
  })
  return report.adequate
})

const PRIMITIVE_BASES = [S.String, S.Number, S.Boolean] as const

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
  ([[chars, value]]) => Either.isLeft(S.decodeUnknownEither(subsetSchema(chars))(value)),
)

it.prop(
  '∀sv_InsiderDraw_∈Schema',
  [withInsider],
  ([[chars, value]]) => Either.isRight(S.decodeUnknownEither(subsetSchema(chars))(value)),
)

const Hexish = S.String.pipe(S.pattern(/^[0-9a-f]*$/), S.annotations({ identifier: 'Hexish' }))

refutes(Hexish, { NonHex: fc.stringMatching(/^[^0-9a-f]$/) })
ruleOfSchemas('Hexish', Hexish)
