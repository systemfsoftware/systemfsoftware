import { Schema as S } from 'effect'
import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  DEFAULT_NAME_SPAN,
  NAME_SPAN_ACTUAL,
  NAME_SPAN_EXPECTED,
  NAME_SPAN_FIX,
  Options,
} from '../entry-name-span.config.js'
import { entryNameSpan } from '../entry-name-span.js'
import { DEFAULT_ENTRY_PATTERN, Options as EntrySurfaceOptions } from '../entry-surface-or-unit.config.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const nameSpanError = (overrides: { name: string; count: number; bound: number; line?: number }) => ({
  messageId: 'nameSpan' as const,
  data: {
    name: overrides.name,
    expected: NAME_SPAN_EXPECTED(overrides.bound),
    actual: NAME_SPAN_ACTUAL(overrides.count),
    fix: NAME_SPAN_FIX,
  },
  ...(overrides.line === undefined ? {} : { line: overrides.line }),
})

const INDEX_ENTRY_OPTION = [{ entryPattern: '(?:^|[\\\\/])index\\.ts$' }]

const nineSingles = Array.from({ length: 9 }, (_, i) => `export { n${i + 1} } from './n${i + 1}.js'`).join('\n')
const tenSingles = `${nineSingles}\nexport { n10 } from './n10.js'`

vitest.describe('shared entry pattern', () => {
  vitest.it('Should_Resolve_Same_Default_Pattern_When_Reading_Both_Entry_Rule_Options', () => {
    const surfaceOptions = S.decodeUnknownSync(EntrySurfaceOptions)({})
    const spanOptions = S.decodeUnknownSync(Options)({})
    vitest.expect(surfaceOptions.entryPattern).toBe(DEFAULT_ENTRY_PATTERN)
    vitest.expect(spanOptions.entryPattern).toBe(DEFAULT_ENTRY_PATTERN)
    vitest.expect(spanOptions.nameSpan).toBe(DEFAULT_NAME_SPAN)
  })
})

ruleTester.run('entry-name-span', entryNameSpan, {
  valid: [
    {
      name: 'Should_Pass_When_EntryExposesExactlyNineFlatNames_At_BoundNine',
      code: nineSingles,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_EntryChunksNamesBehindNamespaceExport',
      code: `export * as Ns from './many.js'`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_EntryExportsAsConstChunkObject_With_TwelveKeys',
      code: `export const Ns = {
  a: 1,
  b: 2,
  c: 3,
  d: 4,
  e: 5,
  f: 6,
  g: 7,
  h: 8,
  i: 9,
  j: 10,
  k: 11,
  l: 12,
} as const`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_NonEntryExposesFortyNames',
      code: `export { ${Array.from({ length: 40 }, (_, i) => `n${i + 1}`).join(', ')} } from './x.js'`,
      filename: 'daemon.executor.ts',
    },
    {
      name: 'Should_Count_AliasedExport_Once_When_EntryExposesEightNamesPlusAlias',
      code: `${nineSingles.replace("export { n9 } from './n9.js'", "export { a as b } from './x.js'")}`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Count_BareWildcard_As_One_Statement_When_EntryChunksOpaqueModule',
      code:
        `export * from './opaque.js'\nexport { n1 } from './n1.js'\nexport { n2 } from './n2.js'\nexport { n3 } from './n3.js'\nexport { n4 } from './n4.js'\nexport { n5 } from './n5.js'\nexport { n6 } from './n6.js'\nexport { n7 } from './n7.js'\nexport { n8 } from './n8.js'`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_CustomEntryPatternDoesNotJudgeModTs',
      code: tenSingles,
      filename: 'mod.ts',
      options: INDEX_ENTRY_OPTION,
    },
    {
      name: 'Should_Pass_When_MultiDeclaratorExport_Stays_Under_Bound',
      code: `export const n1 = 1, n2 = 2
export { n3 } from './n3.js'
export { n4 } from './n4.js'
export { n5 } from './n5.js'
export { n6 } from './n6.js'
export { n7 } from './n7.js'
export { n8 } from './n8.js'`,
      filename: 'mod.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_On_Last_Export_When_EntryExposesTenFlatNames_At_BoundNine',
      code: `export { n1 } from './n1.js'
export { n2 } from './n2.js'
export { n3 } from './n3.js'
export { n4 } from './n4.js'
export { n5 } from './n5.js'
export { n6, n7, n8, n9, n10 } from './n6.js'`,
      filename: 'mod.ts',
      errors: [nameSpanError({ name: 'mod.ts', count: 10, bound: 9, line: 6 })],
    },
    {
      name: 'Should_Report_AliasedExport_Once_With_ExactCount_When_EntryExposesNineNamesPlusAlias',
      code: `${tenSingles.replace("export { n10 } from './n10.js'", "export { a as b } from './x.js'")}`,
      filename: 'mod.ts',
      errors: [nameSpanError({ name: 'mod.ts', count: 10, bound: 9, line: 10 })],
    },
    {
      name: 'Should_Report_When_EntryCombinesBareWildcard_With_NineSingles',
      code: `export * from './opaque.js'\n${nineSingles}`,
      filename: 'mod.ts',
      errors: [nameSpanError({ name: 'mod.ts', count: 10, bound: 9, line: 10 })],
    },
    {
      name: 'Should_Report_When_CustomEntryPatternJudgesIndexTs',
      code: tenSingles,
      filename: 'index.ts',
      options: INDEX_ENTRY_OPTION,
      errors: [nameSpanError({ name: 'index.ts', count: 10, bound: 9, line: 10 })],
    },
    {
      name: 'Should_Respect_Custom_NameSpan_Option_When_EntryExposesFiveNames_At_BoundFour',
      code: `export { n1 } from './n1.js'
export { n2 } from './n2.js'
export { n3 } from './n3.js'
export { n4 } from './n4.js'
export { n5 } from './n5.js'`,
      filename: 'mod.ts',
      options: [{ nameSpan: 4 }],
      errors: [nameSpanError({ name: 'mod.ts', count: 5, bound: 4, line: 5 })],
    },
    {
      name: 'Should_Report_MultiDeclaratorExport_As_Two_Names_When_EntryExposesTenNames',
      code: `export const n1 = 1, n2 = 2
export { n3 } from './n3.js'
export { n4 } from './n4.js'
export { n5 } from './n5.js'
export { n6 } from './n6.js'
export { n7 } from './n7.js'
export { n8 } from './n8.js'
export { n9 } from './n9.js'
export { n10 } from './n10.js'`,
      filename: 'mod.ts',
      errors: [nameSpanError({ name: 'mod.ts', count: 10, bound: 9, line: 9 })],
    },
  ],
})
