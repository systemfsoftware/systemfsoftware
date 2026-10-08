import { describe, expect, it } from 'vitest'

import { scanSuppressions } from '../suppression-scan.js'

const SOURCE_AND_TEST_FILES = ['src/widget.ts', 'tests/widget.test.ts'] as const

describe.each(SOURCE_AND_TEST_FILES)('scanSuppressions on %s', (filename) => {
  it('reports every refused form, line and block, at the column its comment opens', () => {
    const source = [
      '// oxlint-disable-next-line no-console',
      'console.log(1) // oxlint-disable-line no-console',
      '/* oxlint-disable */',
      '/* oxlint-disable-next-line no-console */',
      'console.log(2) /* oxlint-disable-line */',
      '// eslint-disable-next-line no-console',
      'console.log(3) // eslint-disable-line no-console',
      '/* eslint-disable */',
      '// eslint-disable no-console',
      '/* eslint-disable-next-line no-console */',
      'console.log(4) /* eslint-disable-line */',
      '// @ts-expect-error',
      "export const a: number = 'a'",
      '// @ts-expect-error -- the fixture is ill-typed on purpose',
      "export const b: number = 'b'",
      '/// @ts-expect-error',
      "export const c: number = 'c'",
      '/** @ts-expect-error */',
      "export const d: number = 'd'",
    ].join('\n')

    expect(scanSuppressions(filename, source)).toEqual({
      suppressions: [
        { line: 1, column: 1, form: 'oxlint-disable-next-line' },
        { line: 2, column: 16, form: 'oxlint-disable-line' },
        { line: 3, column: 1, form: 'oxlint-disable' },
        { line: 4, column: 1, form: 'oxlint-disable-next-line' },
        { line: 5, column: 16, form: 'oxlint-disable-line' },
        { line: 6, column: 1, form: 'eslint-disable-next-line' },
        { line: 7, column: 16, form: 'eslint-disable-line' },
        { line: 8, column: 1, form: 'eslint-disable' },
        { line: 9, column: 1, form: 'eslint-disable' },
        { line: 10, column: 1, form: 'eslint-disable-next-line' },
        { line: 11, column: 16, form: 'eslint-disable-line' },
        { line: 12, column: 1, form: '@ts-expect-error' },
        { line: 14, column: 1, form: '@ts-expect-error' },
        { line: 16, column: 1, form: '@ts-expect-error' },
        { line: 18, column: 1, form: '@ts-expect-error' },
      ],
      parseErrors: [],
    })
  })

  it('reports nothing for the forms inside literals or later in prose', () => {
    const source = [
      "const single = '// oxlint-disable-next-line no-console'",
      'const double = "/* eslint-disable */"',
      'const template = `// @ts-expect-error ${single}`',
      'const pattern = /\\/\\/ eslint-disable-line/u',
      '// Never add oxlint-disable or eslint-disable-next-line; fix the code instead.',
      '/* A @ts-expect-error here would hide a real type error. */',
      '// ESLINT-DISABLE is not a directive: hosts match the lower-case form only.',
      'export { double, pattern, template }',
    ].join('\n')

    expect(scanSuppressions(filename, source)).toEqual({ suppressions: [], parseErrors: [] })
  })
})

describe('scanSuppressions', () => {
  it('reports a JSX comment and ignores JSX text that looks like one', () => {
    const source = [
      'export const v = (',
      '  <p>',
      '    // eslint-disable',
      '    {/* eslint-disable-line */}',
      '  </p>',
      ')',
    ]
      .join('\n')

    expect(scanSuppressions('src/view.tsx', source)).toEqual({
      suppressions: [{ line: 4, column: 6, form: 'eslint-disable-line' }],
      parseErrors: [],
    })
  })

  it('counts columns in UTF-16 code units past astral characters', () => {
    const source = "const face = '😀😀' // oxlint-disable-line"

    expect(scanSuppressions('src/face.ts', source)).toEqual({
      suppressions: [{ line: 1, column: 21, form: 'oxlint-disable-line' }],
      parseErrors: [],
    })
  })

  it('fails an unparseable file even when its directive is lost with the parse', () => {
    const scan = scanSuppressions('src/broken.ts', 'const = ;\n// eslint-disable-next-line\n')

    expect(scan.parseErrors).toContainEqual(expect.stringMatching(/\S/u))
  })
})
