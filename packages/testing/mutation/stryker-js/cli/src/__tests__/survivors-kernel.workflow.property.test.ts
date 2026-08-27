import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import { refutes } from '@systemfsoftware/effect-schema-law/refutation'
import { FastCheck as fc } from 'effect/testing'
import { isDeepStrictEqual } from 'node:util'

import {
  Admitted,
  serializeSurvivorsHashInput,
  stripSurvivorsKeys,
  SURVIVORS_BOOKKEEPING_KEYS,
  SurvivorsAdmission,
  wasProducedBySurvivorsRun,
} from '../Survivors.workflow.js'

const survivorWith = (
  start: { line: number | null; column: number | null },
  end: { line: number | null; column: number | null },
): unknown => ({
  _tag: 'Admitted',
  survivors: [
    {
      id: 'A',
      fileName: 'file.ts',
      mutatorName: 'mutator',
      replacement: 'replacement',
      location: { start, end },
    },
  ],
})

refutes(Admitted, {
  AdmittedLocationNonFinite: fc.constant(
    survivorWith({ line: 1, column: Number.POSITIVE_INFINITY }, { line: 1, column: 0 }),
  ),
})

refutes(SurvivorsAdmission, {
  SurvivorsAdmissionLocationNonFinite: fc.constant(
    survivorWith({ line: 1, column: Number.POSITIVE_INFINITY }, { line: 1, column: 0 }),
  ),
})

const configValueArb = fc.oneof(
  fc.string({ maxLength: 8 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
)

const configArb = fc
  .dictionary(fc.string({ maxLength: 8 }), configValueArb, { maxKeys: 3 })
  .chain((random) =>
    fc.option(fc.string({ maxLength: 12 }), { nil: undefined }).map((prior) => {
      if (prior === undefined) {
        return random
      }
      return { ...random, survivorsPriorReport: prior }
    })
  )

const hashInputArb = fc.record({
  resolvedOptions: fc.dictionary(fc.string({ maxLength: 8 }), configValueArb, { maxKeys: 4 }),
  frameworkVersion: fc.option(fc.string({ maxLength: 8 }), { nil: undefined }),
  sourceContentHashes: fc.dictionary(fc.string({ maxLength: 8 }), fc.string({ maxLength: 16 }), { maxKeys: 4 }),
})

const reversed = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).reverse())

describe('stripSurvivorsKeys', () => {
  it.prop(
    '∀c_StripTwice_≡StripOnce',
    [configArb],
    ([config]) => isDeepStrictEqual(stripSurvivorsKeys(stripSurvivorsKeys(config)), stripSurvivorsKeys(config)),
  )

  it.prop(
    '∀c_Strip_≡RemovesBookkeepingKeys',
    [configArb],
    ([config]) =>
      SURVIVORS_BOOKKEEPING_KEYS.every((key) => !(key in stripSurvivorsKeys(config))) &&
      !('survivorsPriorReport' in stripSurvivorsKeys(config)),
  )

  it.prop('∀c_Strip_≡LeavesInputUntouched', [configArb], ([config]) => {
    const before = Object.keys(config)
    const values = before.map((key) => config[key])
    stripSurvivorsKeys(config)
    return isDeepStrictEqual(before, Object.keys(config)) &&
      before.every((key, index) => Object.is(config[key], values[index]))
  })
})

describe('wasProducedBySurvivorsRun', () => {
  it.prop(
    '∀c_StrippedConfig_≡NeverSurvivorsProduced',
    [configArb],
    ([config]) => !wasProducedBySurvivorsRun({ config: stripSurvivorsKeys(config) }),
  )

  it.prop(
    '∀c_CarryingTheMarker_≡SurvivorsProduced',
    [configArb],
    ([config]) => wasProducedBySurvivorsRun({ config: { ...config, survivorsPriorReport: 'r' } }),
  )
})

describe('serializeSurvivorsHashInput', () => {
  it.prop(
    '∀i_KeyOrder_≡SameText',
    [hashInputArb],
    ([input]) =>
      serializeSurvivorsHashInput(input) === serializeSurvivorsHashInput({
        resolvedOptions: reversed(input.resolvedOptions),
        frameworkVersion: input.frameworkVersion,
        sourceContentHashes: reversed(input.sourceContentHashes),
      }),
  )

  it.prop('∀i_Serialization_≡LosslessRoundTrip', [hashInputArb], ([input]) =>
    isDeepStrictEqual(
      JSON.parse(serializeSurvivorsHashInput(input)),
      JSON.parse(JSON.stringify(input)),
    ))
})
