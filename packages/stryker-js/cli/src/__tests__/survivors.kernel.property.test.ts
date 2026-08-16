import { describe, it } from '@systemfsoftware/effect-gherkin-spec'
import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'
import { FastCheck as fc } from 'effect/testing'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import { toRelativeNormalizedFileName } from '@systemfsoftware/stryker-js-mutation-run/mutants/incremental-differ'

import {
  admissionVerdict,
  extractSurvivors,
  type HashContent,
  reportMutantToMutant,
  serializeSurvivorsHashInput,
  sourceContentHash,
  stripSurvivorsKeys,
  structuralHash,
  survivorIdentifyingKey,
  survivorMutateSpans,
  SURVIVORS_BOOKKEEPING_KEYS,
  type SurvivorsHashInput,
  wasProducedBySurvivorsRun,
} from '../survivors.kernel.js'

const configValueArb = fc.oneof(
  fc.string({ maxLength: 8 }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
)

const configArb: fc.Arbitrary<Record<string, unknown>> = fc
  .dictionary(fc.string({ maxLength: 8 }), configValueArb, { maxKeys: 3 })
  .chain((random) =>
    fc.option(fc.string({ maxLength: 12 }), { nil: undefined }).map((prior) =>
      prior === undefined ? random : { ...random, survivorsPriorReport: prior }
    )
  )

const reportPositionArb = fc.record({
  line: fc.integer({ min: 1, max: 200 }),
  column: fc.integer({ min: 1, max: 200 }),
})

const reportLocationArb = fc.record({ start: reportPositionArb, end: reportPositionArb })

const mutantResultArb = fc.record(
  {
    id: fc.string({ minLength: 1, maxLength: 8 }),
    mutatorName: fc.string({ minLength: 1, maxLength: 8 }),
    location: reportLocationArb,
    status: fc.constantFrom<schema.MutantStatus>(
      'Killed',
      'Survived',
      'NoCoverage',
      'Timeout',
      'RuntimeError',
      'CompileError',
      'Ignored',
      'Pending',
    ),
    replacement: fc.string({ maxLength: 8 }),
  },
  { requiredKeys: ['id', 'mutatorName', 'location', 'status'] },
)

const fileResultArb = fc.record({
  language: fc.string({ maxLength: 8 }),
  source: fc.string({ maxLength: 16 }),
  mutants: fc.array(mutantResultArb, { maxLength: 5 }),
})

const reportArb: fc.Arbitrary<schema.MutationTestResult> = fc.record({
  config: configArb,
  schemaVersion: fc.string({ maxLength: 8 }),
  thresholds: fc.record({ high: fc.integer(), low: fc.integer() }),
  files: fc.dictionary(fc.string({ maxLength: 8 }), fileResultArb, { maxKeys: 3 }),
})

const hashInputArb: fc.Arbitrary<SurvivorsHashInput> = fc.record({
  resolvedOptions: fc.dictionary(fc.string({ maxLength: 8 }), configValueArb, { maxKeys: 4 }),
  frameworkVersion: fc.option(fc.string({ maxLength: 8 }), { nil: undefined }),
  sourceContentHashes: fc.dictionary(fc.string({ maxLength: 8 }), fc.string({ maxLength: 16 }), { maxKeys: 4 }),
})

const cleanStringArb = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/)

const keyFileArb = fc.constantFrom('src/a.js', 'src/b.js', 'src/c.js')

const keyInputArb = fc.record({
  file: keyFileArb,
  location: reportLocationArb,
  mutatorName: cleanStringArb,
  replacement: fc.option(cleanStringArb, { nil: undefined }),
})

const internalPositionArb = fc.record({
  line: fc.integer({ min: 0, max: 100 }),
  column: fc.integer({ min: 0, max: 100 }),
})

const internalLocationArb = fc.record({ start: internalPositionArb, end: internalPositionArb })

const mutantArb: fc.Arbitrary<Mutant> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 8 }),
  fileName: fc.stringMatching(/^[a-z0-9]+(?:\/[a-z0-9]+)*$/),
  mutatorName: cleanStringArb,
  replacement: cleanStringArb,
  location: internalLocationArb,
})

const survivorListArb = fc.array(mutantArb, { maxLength: 8 })

const sha256Hex: HashContent = (content) => createHash('sha256').update(content, 'utf-8').digest('hex')

const absPath = (file: string): string => `/work/${file}`

const permuteRecord = <T>(record: Readonly<Record<string, T>>): Record<string, T> =>
  Object.fromEntries(Object.entries(record).reverse())

const permuteHashInput = (input: SurvivorsHashInput): SurvivorsHashInput => ({
  resolvedOptions: permuteRecord(input.resolvedOptions),
  frameworkVersion: input.frameworkVersion,
  sourceContentHashes: permuteRecord(input.sourceContentHashes),
})

const nextKeyFile = (file: string): string => file === 'src/a.js' ? 'src/b.js' : 'src/a.js'

const shiftedLocation = (location: schema.Location): schema.Location => ({
  start: { ...location.start, line: location.start.line + 1 },
  end: location.end,
})

describe('stripSurvivorsKeys', () => {
  it.prop(
    '∀c_StripTwice_≡StripOnce',
    [configArb],
    ([config]) => isDeepStrictEqual(stripSurvivorsKeys(stripSurvivorsKeys(config)), stripSurvivorsKeys(config)),
  )

  it.prop('∀c_Strip_≡RemovesBookkeepingKeys', [configArb], ([config]) => {
    const stripped = stripSurvivorsKeys(config)
    return SURVIVORS_BOOKKEEPING_KEYS.every((key) => !(key in stripped))
  })

  it.prop('∀c_Strip_≡PreservesOthersAndInput', [configArb], ([config]) => {
    const inputKeys = Object.keys(config)
    const inputValues = inputKeys.map((key) => config[key])
    const stripped = stripSurvivorsKeys(config)
    const expectedKeys = inputKeys
      .filter((key) => !SURVIVORS_BOOKKEEPING_KEYS.some((bookkeeping) => bookkeeping === key))
      .sort()
    const inputUnchanged = isDeepStrictEqual(inputKeys, Object.keys(config)) &&
      inputKeys.every((key, index) => Object.is(config[key], inputValues[index]))
    return inputUnchanged &&
      isDeepStrictEqual(Object.keys(stripped).sort(), expectedKeys) &&
      expectedKeys.every((key) => Object.is(stripped[key], config[key]))
  })
})

describe('wasProducedBySurvivorsRun', () => {
  it.prop(
    '∀r_StrippedConfig_≡NeverSurvivorsProduced',
    [reportArb],
    ([report]) => !wasProducedBySurvivorsRun({ ...report, config: stripSurvivorsKeys(report.config) }),
  )
})

describe('admission hashing', () => {
  it.prop(
    '∀i_KeyOrder_≡SameSerialization',
    [hashInputArb],
    ([input]) => serializeSurvivorsHashInput(input) === serializeSurvivorsHashInput(permuteHashInput(input)),
  )

  it.prop('∀i_Serialization_≡LosslessRoundTrip', [hashInputArb], ([input]) =>
    isDeepStrictEqual(
      JSON.parse(serializeSurvivorsHashInput(input)),
      JSON.parse(JSON.stringify(input)),
    ))

  it.prop(
    '∀i_StructuralHashKeyOrder_≡SameDigest',
    [hashInputArb],
    ([input]) => structuralHash(input, sha256Hex) === structuralHash(permuteHashInput(input), sha256Hex),
  )

  it.prop('∀i_StructuralHash_≡SerializedSourceHash', [hashInputArb], ([input]) =>
    structuralHash(input, sha256Hex) ===
      sourceContentHash(serializeSurvivorsHashInput(input), sha256Hex))
})

describe('survivorIdentifyingKey', () => {
  it.prop(
    '∀k_OneFieldVariant_≡DifferentKey',
    [keyInputArb],
    ([base]) =>
      survivorIdentifyingKey({ ...base, file: nextKeyFile(base.file) }) !== survivorIdentifyingKey(base) &&
      survivorIdentifyingKey({ ...base, location: shiftedLocation(base.location) }) !== survivorIdentifyingKey(base) &&
      survivorIdentifyingKey({ ...base, mutatorName: `${base.mutatorName}x` }) !== survivorIdentifyingKey(base) &&
      survivorIdentifyingKey({ ...base, replacement: `${base.replacement ?? ''}x` }) !== survivorIdentifyingKey(base),
  )
})

describe('reportMutantToMutant', () => {
  it.prop('∀fm_ReportMutant_≡ResolvedAndShifted', [fc.string({ maxLength: 12 }), mutantResultArb], ([file, mutant]) => {
    const out = reportMutantToMutant(file, mutant, absPath)
    return out.id === mutant.id &&
      out.fileName === absPath(file) &&
      out.mutatorName === mutant.mutatorName &&
      out.replacement === (mutant.replacement ?? mutant.mutatorName) &&
      out.location.start.line === mutant.location.start.line - 1 &&
      out.location.start.column === mutant.location.start.column - 1 &&
      out.location.end.line === mutant.location.end.line - 1 &&
      out.location.end.column === mutant.location.end.column - 1
  })
})

describe('extractSurvivors', () => {
  it.prop('∀r_Extracted_≡SurvivedEntriesInOrder', [reportArb], ([report]) => {
    const abs = (file: string): string => `/work/${file}`
    const survivors = extractSurvivors(report, abs)
    const survivedEntries: { readonly file: string; readonly mutant: schema.MutantResult }[] = []
    for (const [file, fileResult] of Object.entries(report.files)) {
      for (const mutant of fileResult.mutants) {
        if (mutant.status === 'Survived') {
          survivedEntries.push({ file, mutant })
        }
      }
    }
    if (survivors.length !== survivedEntries.length) {
      return false
    }
    return survivedEntries.every((entry, index) => {
      const out = survivors[index]
      if (out === undefined) {
        return false
      }
      const source = entry.mutant
      return out.id === source.id &&
        out.fileName === abs(entry.file) &&
        out.mutatorName === source.mutatorName &&
        out.replacement === (source.replacement ?? source.mutatorName) &&
        out.location.start.line === source.location.start.line - 1 &&
        out.location.start.column === source.location.start.column - 1 &&
        out.location.end.line === source.location.end.line - 1 &&
        out.location.end.column === source.location.end.column - 1
    })
  })
})

describe('survivorMutateSpans', () => {
  it.prop('∀s_Spans_≡DeduplicatedFirstSeen', [survivorListArb], ([survivors]) => {
    const spanOf = (mutant: Mutant): string => {
      const { start, end } = mutant.location
      return `${toRelativeNormalizedFileName(mutant.fileName)}:${start.line + 1}:${start.column}-${
        end.line + 1
      }:${end.column}`
    }
    const output = survivorMutateSpans(survivors)
    const inputSpans = survivors.map(spanOf)
    const firstIndexOf = (span: string): number => inputSpans.indexOf(span)
    const noDuplicates = new Set(output).size === output.length
    const soundAndComplete = output.every((span) => inputSpans.includes(span)) &&
      inputSpans.every((span) => output.includes(span))
    let firstSeenOrder = true
    for (let index = 1; index < output.length; index++) {
      const prev = output[index - 1]
      const current = output[index]
      if (prev === undefined || current === undefined || firstIndexOf(prev) >= firstIndexOf(current)) {
        firstSeenOrder = false
        break
      }
    }
    return noDuplicates && soundAndComplete && firstSeenOrder
  })

  it.prop('∀s_SpanNumbers_≡OneBasedLinesZeroBasedColumns', [survivorListArb], ([survivors]) => {
    const relName = (file: string): string => toRelativeNormalizedFileName(file)
    const numberFrom = (value: string): number => Number(value)
    const spanOf = (mutant: Mutant): string => {
      const { start, end } = mutant.location
      return `${relName(mutant.fileName)}:${start.line + 1}:${start.column}-${end.line + 1}:${end.column}`
    }
    const output = survivorMutateSpans(survivors)
    const inputSpans = survivors.map(spanOf)
    return output.every((span) => {
      const match = /^(.+):(\d+):(\d+)-(\d+):(\d+)$/.exec(span)
      if (match === null) {
        return false
      }
      const [, fileText = '', lineText = '', colText = '', endLineText = '', endColText = ''] = match
      if (fileText === '') {
        return false
      }
      const source = survivors[inputSpans.indexOf(span)]
      if (source === undefined) {
        return false
      }
      return fileText === relName(source.fileName) &&
        numberFrom(lineText) === source.location.start.line + 1 &&
        numberFrom(colText) === source.location.start.column &&
        numberFrom(endLineText) === source.location.end.line + 1 &&
        numberFrom(endColText) === source.location.end.column
    })
  })
})

/**
 * `admissionVerdict` is the classification the workflow dispatches on, so the order of its
 * checks is a decision rather than a detail. A report can satisfy two rejecting conditions at
 * once, and only the order says which wins.
 *
 * One law, not a suite: measured defect by defect, reordering the hash check, dropping a file
 * from `priorSourceHashes` and losing the `no-report` precedence are each already red in
 * `survivors.workflow.property.test.ts`, so laws for those would restate existing coverage.
 * Hoisting the emptiness check above the provenance check is the one defect that leaves that
 * whole suite green.
 */
describe('admissionVerdict', () => {
  const survivorsProducedReport = (
    sources: Readonly<Record<string, string>>,
    survived: boolean,
  ): schema.MutationTestResult => ({
    config: { survivorsPriorReport: 'reports/prior.json' },
    schemaVersion: '1',
    thresholds: { high: 100, low: 100 },
    framework: { name: 'stryker', version: '1.0.0' },
    files: Object.fromEntries(
      Object.entries(sources).map(([name, source]) => [
        name,
        {
          language: 'javascript',
          source,
          mutants: [{
            id: 'm1',
            mutatorName: 'ObjectLiteral',
            location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } },
            status: survived ? ('Survived' as const) : ('Killed' as const),
          }],
        },
      ]),
    ),
  })

  const sourcesArb = fc.dictionary(fc.string({ minLength: 1, maxLength: 5 }), fc.string({ maxLength: 12 }), {
    minKeys: 1,
    maxKeys: 3,
  })

  /**
   * Provenance pre-empts emptiness (KTD7): a report produced by a survivors run is invalid
   * whatever it contains, so a self-consistent one with zero survivors still rejects rather
   * than succeeding with `no-survivors`.
   *
   * The hashes are deliberately absent: the provenance check must reject before anything
   * compares them, so supplying none both states that and keeps the per-case cost flat.
   */
  it.prop('∀r_SurvivorsSourced_→MismatchReject', [sourcesArb, fc.boolean()], ([sources, survived]) => {
    const prior = survivorsProducedReport(sources, survived)
    const verdict = admissionVerdict({
      priorReport: prior,
      currentConfig: prior.config ?? {},
      frameworkVersion: prior.framework?.version ?? '',
      sourceContentHashes: {},
      hashContent: sha256Hex,
      resolveAbsolutePath: (file) => `/work/${file}`,
    })
    return verdict.kind === 'reject' && verdict.reason === 'mismatch' &&
      verdict.remediation.includes('itself produced by a --survivors run')
  })
})
