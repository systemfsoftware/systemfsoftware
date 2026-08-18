/// <reference types="vitest/import-meta" />
import type { Analysis, CheckResult, Problem, ResolutionKind } from '@systemfsoftware/arethetypeswrong-core'
import { problemFlagForKind } from './ProblemUtils.js'
import type { AnsiAnnotation } from './RenderAnsi.js'
import { renderAsciiAnalysis } from './RenderAscii.js'
import { renderJson } from './RenderJson.js'
import { renderTypedAnalysis } from './RenderTyped.js'
import { renderUntyped } from './RenderUntyped.js'

export type CliFormat = 'auto' | 'table' | 'table-flipped' | 'ascii' | 'json'

export interface RenderOptions {
  readonly format: CliFormat
  readonly ignoreRules: readonly string[]
  readonly useEmoji: boolean
  readonly color: boolean
  readonly summary: boolean
  readonly quiet: boolean
  readonly terminalWidth: number
  readonly isTTY: boolean
}

const isUntyped = (r: CheckResult): r is Extract<CheckResult, { types: false }> => 'types' in r && r.types === false

const visibleProblems = (
  analysis: Analysis,
  options: RenderOptions,
): readonly Problem[] => analysis.problems.filter((p) => !options.ignoreRules.includes(problemFlagForKind(p.kind)))

export const renderAnalysis = (
  result: CheckResult,
  options: RenderOptions,
  annotations: Record<string, AnsiAnnotation> = {},
): string => {
  if (options.quiet) return ''
  const format = resolveFormat(options)
  if (format === 'json') {
    if (isUntyped(result)) {
      return renderJson({ analysis: result }, { pretty: true })
    }
    const visible = visibleProblems(result, options)
    return renderJson(
      { analysis: result, problems: visible, ...(options.summary ? { summary: renderSummary(visible) } : {}) },
      { pretty: true },
    )
  }
  if (isUntyped(result)) {
    return renderUntyped({
      packageName: result.packageName,
      packageVersion: result.packageVersion,
      typesPackageName: null,
    })
  }
  const visible = visibleProblems(result, options)
  if (options.summary) {
    return renderSummary(visible) + '\n' + renderAnalysis(result, { ...options, summary: false }, annotations)
  }
  const entrypointNames = Object.keys(result.entrypoints)
  switch (format) {
    case 'ascii':
      return renderAsciiAnalysis(entrypointNames, visible, { useEmoji: options.useEmoji })
    case 'table-flipped':
      return renderTypedAnalysis(
        entrypointNames,
        visible,
        { flipped: true, useEmoji: options.useEmoji, color: options.color },
        annotations,
      )
    case 'table':
      return renderTypedAnalysis(
        entrypointNames,
        visible,
        { flipped: false, useEmoji: options.useEmoji, color: options.color },
        annotations,
      )
  }
}

const resolveFormat = (options: RenderOptions): 'table' | 'table-flipped' | 'ascii' | 'json' => {
  if (options.format === 'json') return 'json'
  if (options.format === 'ascii') return 'ascii'
  if (options.format === 'table') return 'table'
  if (options.format === 'table-flipped') return 'table-flipped'
  if (options.isTTY && options.terminalWidth >= 100) return 'table-flipped'
  return 'ascii'
}

const renderSummary = (problems: readonly Problem[]): string => {
  if (problems.length === 0) return 'No problems found.'
  const grouped: Record<string, Problem[]> = {}
  for (const p of problems) {
    grouped[p.kind] = grouped[p.kind] ?? []
    grouped[p.kind].push(p)
  }
  return Object.entries(grouped)
    .map(([kind, list]) => `${kind}: ${list.length}`)
    .join('\n')
}

if (import.meta.vitest !== void 0) {
  const { describe, expect, it } = import.meta.vitest
  // The rendered JSON is decoded, not asserted: the shape each test relies on
  // is stated once and a renderer that stops emitting a key fails here by name.
  // A throwing codec is the assertion in a test block, which is where it belongs.
  const { Schema: S } = await import('effect')
  const JsonReport = S.Struct({
    analysis: S.Struct({ packageName: S.String, types: S.Unknown }),
    problems: S.optional(S.Array(S.Struct({ kind: S.String }))),
    summary: S.optional(S.String),
  })
  const readReport = (text: string) => S.decodeUnknownSync(JsonReport)(JSON.parse(text))

  // Built rather than written as a literal: a control character inside a regex
  // literal is unreadable in a diff and banned outright.
  const ANSI = new RegExp(`${String.fromCharCode(0x1b)}\\[`)
  const isJsonText = (text: string): boolean => {
    try {
      JSON.parse(text)
      return true
    } catch {
      return false
    }
  }

  const options = (overrides: Partial<RenderOptions> = {}): RenderOptions => ({
    format: 'table',
    ignoreRules: [],
    useEmoji: false,
    color: false,
    summary: false,
    quiet: false,
    terminalWidth: 80,
    isTTY: false,
    ...overrides,
  })

  // Only some problem kinds carry a `resolutionKind`; a `FalseCJS` never does.
  // The renderer places a resolution-bearing problem in its own column and a
  // kind without one in every column, so both fixtures are needed and neither
  // may be spelled with a field its kind does not have.
  const moduleKind = { detectedKind: 1, detectedReason: 'extension', reasonFileName: '/index.js' } as const
  const noResolution = (resolutionKind: ResolutionKind): Problem => ({
    kind: 'NoResolution',
    entrypoint: '.',
    resolutionKind,
  })
  const falseCjs = (): Problem => ({
    kind: 'FalseCJS',
    typesFileName: '/index.d.ts',
    implementationFileName: '/index.js',
    typesModuleKind: moduleKind,
    implementationModuleKind: moduleKind,
  })
  const falseEsm = (): Problem => ({
    kind: 'FalseESM',
    typesFileName: '/index.d.mts',
    implementationFileName: '/index.mjs',
    typesModuleKind: moduleKind,
    implementationModuleKind: moduleKind,
  })

  const resolutionOf = (resolutionKind: ResolutionKind) => ({ name: '.', resolutionKind })
  const untyped: CheckResult = { packageName: 'pkg', packageVersion: '1.0.0', types: false }
  const typed = (problems: readonly Problem[] = [noResolution('node10')]): CheckResult => ({
    packageName: 'pkg',
    packageVersion: '1.0.0',
    buildTools: {},
    types: { kind: 'included' },
    entrypoints: {
      '.': {
        subpath: '.',
        hasTypes: true,
        isWildcard: false,
        resolutions: {
          node10: resolutionOf('node10'),
          'node16-cjs': resolutionOf('node16-cjs'),
          'node16-esm': resolutionOf('node16-esm'),
          bundler: resolutionOf('bundler'),
        },
      },
    },
    programInfo: { bundler: {}, node10: {}, node16: {} },
    problems,
  })

  describe('renderAnalysis', () => {
    it('Should_ReturnEmpty_When_QuietIsSet', () => {
      expect(renderAnalysis(typed(), options({ quiet: true }))).toBe('')
      expect(renderAnalysis(untyped, options({ quiet: true }))).toBe('')
    })

    it('Should_RenderTheUntypedNotice_When_TheResultIsUntyped', () => {
      const output = renderAnalysis(untyped, options())
      expect(output).toContain('Package pkg@1.0.0 has no types.')
      expect(output).toContain('No @types package found.')
    })

    it('Should_OmitTheProblemsKey_When_UntypedInJsonFormat', () => {
      const output = renderAnalysis(untyped, options({ format: 'json' }))
      const parsed = readReport(output)
      expect(parsed.analysis.packageName).toBe('pkg')
      expect(parsed.analysis.types).toBe(false)
      expect(parsed.problems).toBeUndefined()
      expect(output).toMatch(/\n {2}"/)
    })

    it('Should_CarryEntrypointNamesAndSymbols_When_RenderingTheTypedTable', () => {
      const output = renderAnalysis(typed(), options())
      expect(output).toContain('.')
      expect(output).toContain('X')
      expect(output).toContain('node10')
    })

    it('Should_EmitNoAnsi_When_ColorIsOff', () => {
      for (const format of ['table', 'table-flipped', 'ascii'] as const) {
        expect(renderAnalysis(typed(), options({ format }))).not.toMatch(ANSI)
      }
    })

    it('Should_CarryExactlyTheVisibleProblems_When_JsonAndAKindIsIgnored', () => {
      const output = renderAnalysis(
        typed([noResolution('node10'), falseCjs(), falseEsm()]),
        options({ format: 'json', ignoreRules: ['false-cjs'] }),
      )
      const parsed = readReport(output)
      expect(parsed.analysis.packageName).toBe('pkg')
      expect(parsed.summary).toBeUndefined()
      expect((parsed.problems ?? []).map((p) => p.kind)).toEqual(['NoResolution', 'FalseESM'])
    })

    it('Should_CarryAnEmptyProblemsArray_When_EverythingIsIgnored', () => {
      const output = renderAnalysis(
        typed([noResolution('node10')]),
        options({ format: 'json', ignoreRules: ['no-resolution'] }),
      )
      const parsed = readReport(output)
      expect(parsed.problems).toEqual([])
    })

    it('Should_IndentWithTwoSpaces_When_RenderingJson', () => {
      const result = typed([falseCjs()])
      const output = renderAnalysis(result, options({ format: 'json' }))
      expect(output).toMatch(/\n {2}"/)
      expect(output).not.toBe(JSON.stringify({ analysis: result, problems: [] }))
    })

    it('Should_CountProblemKinds_When_JsonCarriesASummary', () => {
      const output = renderAnalysis(
        typed([noResolution('node10'), noResolution('bundler'), falseCjs()]),
        options({ format: 'json', summary: true }),
      )
      const parsed = readReport(output)
      expect(parsed.summary).toContain('NoResolution: 2')
      expect(parsed.summary).toContain('FalseCJS: 1')
    })

    it('Should_PrefixTheCountLines_When_SummaryPrecedesTheTable', () => {
      const output = renderAnalysis(typed([noResolution('node10'), falseCjs()]), options({ summary: true }))
      expect(output.startsWith('NoResolution: 1\nFalseCJS: 1\n')).toBe(true)
    })

    it('Should_SayNoProblemsFound_When_SummaryHasNothingVisible', () => {
      expect(renderAnalysis(typed([]), options({ summary: true })).startsWith('No problems found.')).toBe(true)
    })

    it('Should_UseEmojiSymbols_When_AsciiAndEmojiRequested', () => {
      const output = renderAnalysis(typed([falseCjs()]), options({ format: 'ascii', useEmoji: true }))
      expect(output).toContain('✘')
    })

    it('Should_FillEveryResolutionColumn_When_TheKindCarriesNoResolutionKind', () => {
      const output = renderAnalysis(typed([falseCjs()]), options())
      expect(output.match(/X/g)?.length ?? 0).toBe(4)
    })

    it('Should_FillOneColumn_When_TheProblemCarriesAResolutionKind', () => {
      const output = renderAnalysis(typed([noResolution('node10')]), options())
      expect(output.match(/X/g)?.length ?? 0).toBe(1)
    })

    // Format-comparison tests. These must run LAST: stryker activates a mutant
    // only after ~70% of its dry-run hits, so the observing tests need to be
    // among the final hits to see the active mutant.
    it('Should_NotBeValidJson_When_FormatIsTable', () => {
      expect(isJsonText(renderAnalysis(typed(), options({ format: 'table' })))).toBe(false)
    })

    it('Should_DifferFromTable_When_FormatIsTableFlipped', () => {
      const flipped = renderAnalysis(typed(), options({ format: 'table-flipped' }))
      const unflipped = renderAnalysis(typed(), options({ format: 'table' }))
      expect(flipped).not.toBe(unflipped)
    })

    it('Should_ListResolutionKindsAsColumns_When_FormatIsTable', () => {
      const output = renderAnalysis(typed(), options({ format: 'table' }))
      const firstLine = output.split('\n')[0] ?? ''
      expect(firstLine).toContain('node16-cjs')
      expect(firstLine).toContain('bundler')
    })

    it('Should_ListEntrypointsAsColumns_When_FormatIsTableFlipped', () => {
      const output = renderAnalysis(typed(), options({ format: 'table-flipped' }))
      expect(output.split('\n')[0] ?? '').toContain('.')
    })

    it('Should_StripAnsiForAsciiAndKeepItForTable_When_ColorIsOn', () => {
      const annotations = { X: { color: 'red' as const } }
      const asciiOutput = renderAnalysis(typed(), options({ format: 'ascii', color: true }), annotations)
      const tableOutput = renderAnalysis(typed(), options({ format: 'table', color: true }), annotations)
      expect(asciiOutput).not.toMatch(ANSI)
      expect(tableOutput).toMatch(ANSI)
    })

    it('Should_StayAscii_When_ExplicitAsciiOnAWideTty', () => {
      const asciiOnTty = renderAnalysis(typed(), options({ format: 'ascii', isTTY: true, terminalWidth: 120 }))
      expect(asciiOnTty).toBe(renderAnalysis(typed(), options({ format: 'ascii' })))
    })

    it('Should_StayUnflipped_When_ExplicitTableOnAWideTty', () => {
      const tableOnTty = renderAnalysis(typed(), options({ format: 'table', isTTY: true, terminalWidth: 120 }))
      expect(tableOnTty).toBe(renderAnalysis(typed(), options({ format: 'table' })))
    })

    it('Should_StayFlipped_When_ExplicitTableFlippedOffATty', () => {
      const flippedOffTty = renderAnalysis(
        typed(),
        options({ format: 'table-flipped', isTTY: false, terminalWidth: 80 }),
      )
      expect(flippedOffTty).toBe(renderAnalysis(typed(), options({ format: 'table-flipped' })))
    })

    it('Should_EqualTableFlipped_When_AutoOnAWideTty', () => {
      const wide = renderAnalysis(typed(), options({ format: 'auto', isTTY: true, terminalWidth: 120 }))
      expect(wide).toBe(renderAnalysis(typed(), options({ format: 'table-flipped' })))
    })

    it('Should_EqualAscii_When_AutoOnANarrowTty', () => {
      const narrow = renderAnalysis(typed(), options({ format: 'auto', isTTY: true, terminalWidth: 80 }))
      expect(narrow).toBe(renderAnalysis(typed(), options({ format: 'ascii' })))
    })

    it('Should_FlipAtExactlyOneHundredColumns_When_AutoOnATty', () => {
      const at100 = renderAnalysis(typed(), options({ format: 'auto', isTTY: true, terminalWidth: 100 }))
      expect(at100).toBe(renderAnalysis(typed(), options({ format: 'table-flipped' })))
    })

    it('Should_EqualAscii_When_AutoOnAWideNonTty', () => {
      const wideNonTty = renderAnalysis(typed(), options({ format: 'auto', isTTY: false, terminalWidth: 120 }))
      expect(wideNonTty).toBe(renderAnalysis(typed(), options({ format: 'ascii' })))
    })

    it('Should_StayFreeOfAnsi_When_AsciiOnAWideTtyWithColorOn', () => {
      const annotations = { X: { color: 'red' as const } }
      const asciiOnTty = renderAnalysis(
        typed(),
        options({ format: 'ascii', color: true, isTTY: true, terminalWidth: 120 }),
        annotations,
      )
      expect(asciiOnTty).not.toMatch(ANSI)
    })

    it('Should_StripAnsi_When_AutoOnANarrowTtyWithColorOn', () => {
      const annotations = { X: { color: 'red' as const } }
      const narrow = renderAnalysis(
        typed(),
        options({ format: 'auto', color: true, isTTY: true, terminalWidth: 80 }),
        annotations,
      )
      expect(narrow).not.toMatch(ANSI)
    })
  })
}
