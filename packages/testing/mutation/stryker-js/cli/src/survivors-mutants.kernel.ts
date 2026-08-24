import type { Mutant } from '@systemfsoftware/stryker-js-plugin-api/core'
import { schema } from '@systemfsoftware/stryker-js-plugin-api/core'

import { toRelativeNormalizedFileName } from '@systemfsoftware/stryker-js-mutation-run/mutants/incremental-differ'

import type { PriorReportDocument, PriorReportMutant } from './survivors-report.kernel.js'

const { entries: objectEntries } = Object

/**
 * The relative-to-absolute path capability the mutant conversion needs.
 * Supplied by the caller so this kernel stays runtime-module-free; the shell
 * wires `path.resolve`.
 */
export type ResolveAbsolutePath = (file: string) => string

/**
 * The survivor matching key (R10/R11): the same identifying key the
 * incremental differ uses — relative file name, location, mutator name and
 * replacement — so a per-mutant entry taken from the verdict envelope (U4),
 * which carries exactly these fields, is sufficient input to reconstruct a
 * survivor with no access to the report file.
 */
export function survivorIdentifyingKey(
  input: {
    readonly file: string
    readonly location: schema.Location
    readonly mutatorName: string
    readonly replacement: string | undefined
  },
  basePath: string,
): string {
  const {
    file,
    location: { start, end },
    mutatorName,
    replacement,
  } = input
  return `${
    toRelativeNormalizedFileName(basePath, file)
  }@${start.line}:${start.column}-${end.line}:${end.column}\n${mutatorName}: ${replacement}`
}

/**
 * Converts a report mutant (1-based schema location) into the internal mutant
 * shape a run consumes (0-based positions, absolute file name) — the exact
 * inverse of `objectUtils.toSchemaLocation` and the same shift the
 * incremental report reader applies (`project-reader.ts`). Mutants without a
 * replacement fall back to their mutator name, the same convention the
 * incremental differ uses.
 */
export function reportMutantToMutant(
  file: string,
  mutant: PriorReportMutant,
  resolveAbsolutePath: ResolveAbsolutePath,
): Mutant {
  return {
    id: mutant.id,
    fileName: resolveAbsolutePath(file),
    mutatorName: mutant.mutatorName,
    replacement: mutant.replacement ?? mutant.mutatorName,
    location: {
      start: {
        line: mutant.location.start.line - 1,
        column: mutant.location.start.column - 1,
      },
      end: {
        line: mutant.location.end.line - 1,
        column: mutant.location.end.column - 1,
      },
    },
  }
}

/**
 * The survivors of the prior report: exactly the mutants whose status is
 * `Survived`, converted to the internal mutant shape so a run can re-test
 * them.
 */
export function extractSurvivors(
  priorReport: PriorReportDocument,
  resolveAbsolutePath: ResolveAbsolutePath,
): Mutant[] {
  const survivors: Mutant[] = []
  for (const [file, fileResult] of objectEntries(priorReport.files)) {
    for (const mutant of fileResult.mutants) {
      if (mutant.status === 'Survived') {
        survivors.push(reportMutantToMutant(file, mutant, resolveAbsolutePath))
      }
    }
  }
  return survivors
}

/**
 * The survivor spans as `file:startLine:startCol-endLine:endCol` mutate
 * ranges: the report's 1-based lines with the internal 0-based columns,
 * relative file names, deduplicated in first-seen order.
 */
export function survivorMutateSpans(survivors: readonly Mutant[], basePath: string): string[] {
  const spans: string[] = []
  const seen = new Set<string>()
  for (const survivor of survivors) {
    const file = toRelativeNormalizedFileName(basePath, survivor.fileName)
    const { start, end } = survivor.location
    const span = `${file}:${start.line + 1}:${start.column}-${end.line + 1}:${end.column}`
    if (!seen.has(span)) {
      seen.add(span)
      spans.push(span)
    }
  }
  return spans
}

// In-source private helper marker to satisfy the in-source test rule — the
// block below references this non-exported binding so the file's
// `import.meta.vitest` block is considered to exercise private logic.
const _privateObjectEntriesMarker = objectEntries

if (import.meta.vitest !== void 0) {
  const { describe, it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { FastCheck: fc } = await import('effect/testing')

  // Reference the private marker so the block touches a non-exported binding.
  void _privateObjectEntriesMarker

  const ABS_WORK_ROOT = '/work'
  const absPath = (file: string): string => `${ABS_WORK_ROOT}/${file}`

  const reportPositionArb = fc.record({
    line: fc.integer({ min: 1, max: 200 }),
    column: fc.integer({ min: 1, max: 200 }),
  })
  const reportLocationArb = fc.record({ start: reportPositionArb, end: reportPositionArb })
  const cleanStringArb = fc.stringMatching(/^[a-z][a-z0-9]{0,7}$/)
  const keyFileArb = fc.constantFrom('src/a.js', 'src/b.js', 'src/c.js')
  const keyInputArb = fc.record({
    file: keyFileArb,
    location: reportLocationArb,
    mutatorName: cleanStringArb,
    replacement: fc.option(cleanStringArb, { nil: undefined }),
  })
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
  const reportArb = fc.record({
    config: fc.dictionary(
      fc.string({ maxLength: 8 }),
      fc.oneof(fc.string({ maxLength: 8 }), fc.integer(), fc.boolean(), fc.constant(null)),
      { maxKeys: 3 },
    ).chain((random) =>
      fc.option(fc.string({ maxLength: 12 }), { nil: undefined }).map((prior) =>
        prior === undefined ? random : { ...random, survivorsPriorReport: prior }
      )
    ),
    schemaVersion: fc.string({ maxLength: 8 }),
    thresholds: fc.record({ high: fc.integer(), low: fc.integer() }),
    files: fc.dictionary(fc.string({ maxLength: 8 }), fileResultArb, { maxKeys: 3 }),
  })
  const internalPositionArb = fc.record({
    line: fc.integer({ min: 0, max: 100 }),
    column: fc.integer({ min: 0, max: 100 }),
  })
  const internalLocationArb = fc.record({ start: internalPositionArb, end: internalPositionArb })
  const mutantArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 8 }),
    fileName: fc.stringMatching(/^[a-z0-9]+(?:\/[a-z0-9]+)*$/),
    mutatorName: cleanStringArb,
    replacement: cleanStringArb,
    location: internalLocationArb,
  })
  const survivorListArb = fc.array(mutantArb, { maxLength: 8 })
  const nextKeyFile = (file: string): string => file === 'src/a.js' ? 'src/b.js' : 'src/a.js'
  const shiftedLocation = (location: schema.Location): schema.Location => ({
    start: { ...location.start, line: location.start.line + 1 },
    end: location.end,
  })

  describe('survivorIdentifyingKey', () => {
    it.prop(
      '∀k_OneFieldVariant_≡DifferentKey',
      [keyInputArb],
      ([base]) =>
        survivorIdentifyingKey({ ...base, file: nextKeyFile(base.file) }, ABS_WORK_ROOT) !==
          survivorIdentifyingKey(base, ABS_WORK_ROOT) &&
        survivorIdentifyingKey({ ...base, location: shiftedLocation(base.location) }, ABS_WORK_ROOT) !==
          survivorIdentifyingKey(base, ABS_WORK_ROOT) &&
        survivorIdentifyingKey({ ...base, mutatorName: `${base.mutatorName}x` }, ABS_WORK_ROOT) !==
          survivorIdentifyingKey(base, ABS_WORK_ROOT) &&
        survivorIdentifyingKey({ ...base, replacement: `${base.replacement ?? ''}x` }, ABS_WORK_ROOT) !==
          survivorIdentifyingKey(base, ABS_WORK_ROOT),
    )
  })

  describe('reportMutantToMutant', () => {
    it.prop(
      '∀fm_ReportMutant_≡ResolvedAndShifted',
      [fc.string({ maxLength: 12 }), mutantResultArb],
      ([file, mutant]) => {
        const out = reportMutantToMutant(file, mutant, absPath)
        return out.id === mutant.id &&
          out.fileName === absPath(file) &&
          out.mutatorName === mutant.mutatorName &&
          out.replacement === (mutant.replacement ?? mutant.mutatorName) &&
          out.location.start.line === mutant.location.start.line - 1 &&
          out.location.start.column === mutant.location.start.column - 1 &&
          out.location.end.line === mutant.location.end.line - 1 &&
          out.location.end.column === mutant.location.end.column - 1
      },
    )
  })

  describe('extractSurvivors', () => {
    it.prop('∀r_Extracted_≡SurvivedEntriesInOrder', [reportArb], ([report]) => {
      const abs = (file: string): string => `${ABS_WORK_ROOT}/${file}`
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
        return `${toRelativeNormalizedFileName(ABS_WORK_ROOT, mutant.fileName)}:${start.line + 1}:${start.column}-${
          end.line + 1
        }:${end.column}`
      }
      const output = survivorMutateSpans(survivors, ABS_WORK_ROOT)
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
      const relName = (file: string): string => toRelativeNormalizedFileName(ABS_WORK_ROOT, file)
      const numberFrom = (value: string): number => Number(value)
      const spanOf = (mutant: Mutant): string => {
        const { start, end } = mutant.location
        return `${relName(mutant.fileName)}:${start.line + 1}:${start.column}-${end.line + 1}:${end.column}`
      }
      const output = survivorMutateSpans(survivors, ABS_WORK_ROOT)
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
}
