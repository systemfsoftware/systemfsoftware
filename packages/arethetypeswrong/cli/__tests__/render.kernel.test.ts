import { it } from '@effect/vitest'
import { describe, expect } from 'vitest'

import { renderAnalysis, type RenderOptions } from '../src/render.kernel.js'

const defaultOptions = (overrides: Partial<RenderOptions> = {}): RenderOptions => ({
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

const typedResult = (
  problems: ReadonlyArray<{ kind: string; resolutionKind?: string }> = [{ kind: 'FalseCJS', resolutionKind: 'node10' }],
) => ({
  types: true as const,
  packageName: 'pkg',
  packageVersion: '1.0.0',
  entrypoints: { '.': { name: '.', subpath: '.' } },
  problems,
})

describe('renderAnalysis workflow', () => {
  it('returns an empty string when quiet is set, whatever the result', () => {
    expect(renderAnalysis(typedResult(), defaultOptions({ quiet: true }))).toBe('')
    expect(
      renderAnalysis(
        { packageName: 'pkg', packageVersion: '1.0.0', types: false },
        defaultOptions({ quiet: true }),
      ),
    ).toBe('')
  })

  it('renders the untyped notice for an untyped result', () => {
    const output = renderAnalysis(
      { packageName: 'pkg', packageVersion: '1.0.0', types: false },
      defaultOptions(),
    )
    expect(output).toContain('Package pkg@1.0.0 has no types.')
    expect(output).toContain('No @types package found.')
  })

  it('renders untyped results as analysis-only json in json format', () => {
    const output = renderAnalysis(
      { packageName: 'pkg', packageVersion: '1.0.0', types: false },
      defaultOptions({ format: 'json' }),
    )
    const parsed = JSON.parse(output) as {
      analysis: { packageName: string; types: boolean }
      problems?: unknown
    }
    expect(parsed.analysis.packageName).toBe('pkg')
    expect(parsed.analysis.types).toBe(false)
    expect(parsed.problems).toBeUndefined()
    expect(output).toMatch(/\n  "/)
  })

  it('renders the typed table with entrypoint names and problem symbols', () => {
    const output = renderAnalysis(typedResult(), defaultOptions())
    expect(output).toContain('.')
    expect(output).toContain('X')
    expect(output).toContain('node10')
  })

  it('table and ascii output contain no ANSI escapes when color is off', () => {
    for (const format of ['table', 'table-flipped', 'ascii'] as const) {
      const output = renderAnalysis(typedResult(), defaultOptions({ format }))
      expect(output).not.toMatch(/\u001b\[/)
    }
  })

  it('json output carries exactly the visible problems', () => {
    const result = typedResult([{ kind: 'NoResolution' }, { kind: 'FalseCJS' }, { kind: 'FalseESM' }])
    const output = renderAnalysis(result, defaultOptions({ format: 'json', ignoreRules: ['false-cjs'] }))
    const parsed = JSON.parse(output) as {
      analysis: { packageName: string }
      problems: Array<{ kind: string }>
      summary?: string
    }
    expect(parsed.analysis.packageName).toBe('pkg')
    expect(parsed.summary).toBeUndefined()
    expect(parsed.problems.map((p) => p.kind)).toEqual(['NoResolution', 'FalseESM'])
  })

  it('json output with everything ignored has an empty problems array', () => {
    const result = typedResult([{ kind: 'NoResolution' }])
    const output = renderAnalysis(result, defaultOptions({ format: 'json', ignoreRules: ['no-resolution'] }))
    const parsed = JSON.parse(output) as { problems: Array<{ kind: string }> }
    expect(parsed.problems).toEqual([])
  })

  it('json output is pretty-printed with two-space indentation', () => {
    const result = typedResult([{ kind: 'FalseCJS' }])
    const output = renderAnalysis(result, defaultOptions({ format: 'json' }))
    expect(output).toMatch(/\n  "/)
    expect(output).not.toBe(JSON.stringify({ analysis: result, problems: [] }))
  })

  it('json output with summary adds a summary key that counts problem kinds', () => {
    const result = typedResult([{ kind: 'NoResolution' }, { kind: 'NoResolution' }, { kind: 'FalseCJS' }])
    const output = renderAnalysis(result, defaultOptions({ format: 'json', summary: true }))
    const parsed = JSON.parse(output) as { summary: string }
    expect(parsed.summary).toContain('NoResolution: 2')
    expect(parsed.summary).toContain('FalseCJS: 1')
  })

  it('summary mode prefixes the count lines and then renders the table', () => {
    const result = typedResult([{ kind: 'NoResolution' }, { kind: 'FalseCJS' }])
    const output = renderAnalysis(result, defaultOptions({ summary: true }))
    expect(output.startsWith('NoResolution: 1\nFalseCJS: 1\n')).toBe(true)
  })

  it('summary mode prints "No problems found." when nothing is visible', () => {
    const result = typedResult([])
    const output = renderAnalysis(result, defaultOptions({ summary: true }))
    expect(output.startsWith('No problems found.')).toBe(true)
  })

  it('ascii output uses emoji symbols when requested', () => {
    const output = renderAnalysis(
      typedResult([{ kind: 'FalseCJS' }]),
      defaultOptions({ format: 'ascii', useEmoji: true }),
    )
    expect(output).toContain('✘')
  })

  it('renders a problem without a resolutionKind in every resolution column', () => {
    const output = renderAnalysis(typedResult([{ kind: 'FalseCJS' }]), defaultOptions())
    expect(output.match(/X/g)?.length ?? 0).toBe(4)
  })

  it('renders a resolution-carrying problem in exactly its own column', () => {
    const output = renderAnalysis(
      typedResult([{ kind: 'FalseCJS', resolutionKind: 'node10' }]),
      defaultOptions(),
    )
    expect(output.match(/X/g)?.length ?? 0).toBe(1)
  })

  // Format-comparison tests. These must run LAST: stryker activates a mutant
  // only after ~70% of its dry-run hits, so the observing tests need to be
  // among the final hits to see the active mutant.
  it('table output is not valid JSON', () => {
    const output = renderAnalysis(typedResult(), defaultOptions({ format: 'table' }))
    expect(() => JSON.parse(output)).toThrow()
  })

  it('table-flipped output differs from table output for the same input', () => {
    const flipped = renderAnalysis(typedResult(), defaultOptions({ format: 'table-flipped' }))
    const unflipped = renderAnalysis(typedResult(), defaultOptions({ format: 'table' }))
    expect(flipped).not.toBe(unflipped)
  })

  it('table format lists resolution kinds as columns', () => {
    const output = renderAnalysis(typedResult(), defaultOptions({ format: 'table' }))
    const firstLine = output.split('\n')[0] ?? ''
    expect(firstLine).toContain('node16-cjs')
    expect(firstLine).toContain('bundler')
  })

  it('table-flipped format lists entrypoints as columns', () => {
    const output = renderAnalysis(typedResult(), defaultOptions({ format: 'table-flipped' }))
    const firstLine = output.split('\n')[0] ?? ''
    expect(firstLine).toContain('.')
  })

  it('ascii strips ANSI even when color is on, while table keeps it', () => {
    const annotations = { X: { color: 'red' as const } }
    const asciiOutput = renderAnalysis(typedResult(), defaultOptions({ format: 'ascii', color: true }), annotations)
    const tableOutput = renderAnalysis(typedResult(), defaultOptions({ format: 'table', color: true }), annotations)
    expect(asciiOutput).not.toMatch(/\u001b\[/)
    expect(tableOutput).toMatch(/\u001b\[/)
  })

  it('explicit ascii stays ascii even on a wide TTY', () => {
    const asciiOnTty = renderAnalysis(
      typedResult(),
      defaultOptions({ format: 'ascii', isTTY: true, terminalWidth: 120 }),
    )
    const explicitAscii = renderAnalysis(typedResult(), defaultOptions({ format: 'ascii' }))
    expect(asciiOnTty).toBe(explicitAscii)
  })

  it('explicit table stays unflipped even on a wide TTY', () => {
    const tableOnTty = renderAnalysis(
      typedResult(),
      defaultOptions({ format: 'table', isTTY: true, terminalWidth: 120 }),
    )
    const explicitTable = renderAnalysis(typedResult(), defaultOptions({ format: 'table' }))
    expect(tableOnTty).toBe(explicitTable)
  })

  it('explicit table-flipped stays flipped even off a TTY', () => {
    const flippedOffTty = renderAnalysis(
      typedResult(),
      defaultOptions({ format: 'table-flipped', isTTY: false, terminalWidth: 80 }),
    )
    const explicitFlipped = renderAnalysis(typedResult(), defaultOptions({ format: 'table-flipped' }))
    expect(flippedOffTty).toBe(explicitFlipped)
  })

  it('auto format on a wide TTY equals explicit table-flipped', () => {
    const wide = renderAnalysis(typedResult(), defaultOptions({ format: 'auto', isTTY: true, terminalWidth: 120 }))
    const explicitFlipped = renderAnalysis(typedResult(), defaultOptions({ format: 'table-flipped' }))
    expect(wide).toBe(explicitFlipped)
  })

  it('auto format on a narrow TTY equals explicit ascii', () => {
    const narrow = renderAnalysis(typedResult(), defaultOptions({ format: 'auto', isTTY: true, terminalWidth: 80 }))
    const explicitAscii = renderAnalysis(typedResult(), defaultOptions({ format: 'ascii' }))
    expect(narrow).toBe(explicitAscii)
  })

  it('auto format flips at exactly 100 columns on a TTY', () => {
    const at100 = renderAnalysis(typedResult(), defaultOptions({ format: 'auto', isTTY: true, terminalWidth: 100 }))
    const explicitFlipped = renderAnalysis(typedResult(), defaultOptions({ format: 'table-flipped' }))
    expect(at100).toBe(explicitFlipped)
  })

  it('auto format on a wide non-TTY terminal equals explicit ascii', () => {
    const wideNonTty = renderAnalysis(
      typedResult(),
      defaultOptions({ format: 'auto', isTTY: false, terminalWidth: 120 }),
    )
    const explicitAscii = renderAnalysis(typedResult(), defaultOptions({ format: 'ascii' }))
    expect(wideNonTty).toBe(explicitAscii)
  })

  it('ascii output stays free of ANSI on a wide TTY even with color on', () => {
    const annotations = { X: { color: 'red' as const } }
    const asciiOnTty = renderAnalysis(
      typedResult(),
      defaultOptions({ format: 'ascii', color: true, isTTY: true, terminalWidth: 120 }),
      annotations,
    )
    expect(asciiOnTty).not.toMatch(/\u001b\[/)
  })

  it('auto format on a narrow TTY strips ANSI while color is on', () => {
    const annotations = { X: { color: 'red' as const } }
    const narrow = renderAnalysis(
      typedResult(),
      defaultOptions({ format: 'auto', color: true, isTTY: true, terminalWidth: 80 }),
      annotations,
    )
    expect(narrow).not.toMatch(/\u001b\[/)
  })
})
