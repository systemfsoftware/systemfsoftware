import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  ENTRY_MIX_ACTUAL,
  ENTRY_MIX_EXPECTED,
  ENTRY_MIX_FIX,
  NON_ENTRY_REEXPORT_ACTUAL,
  NON_ENTRY_REEXPORT_EXPECTED,
  NON_ENTRY_REEXPORT_FIX,
} from '../entry-surface-or-unit.config.js'
import { entrySurfaceOrUnit } from '../entry-surface-or-unit.js'

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

const entryMixError = (name: string, line?: number) => ({
  messageId: 'entrySurfaceAndUnit' as const,
  data: { name, expected: ENTRY_MIX_EXPECTED, actual: ENTRY_MIX_ACTUAL, fix: ENTRY_MIX_FIX },
  ...(line === undefined ? {} : { line }),
})

const foreignReexportError = (name: string, line?: number) => ({
  messageId: 'nonEntryForeignReexport' as const,
  data: {
    name,
    expected: NON_ENTRY_REEXPORT_EXPECTED,
    actual: NON_ENTRY_REEXPORT_ACTUAL,
    fix: NON_ENTRY_REEXPORT_FIX,
  },
  ...(line === undefined ? {} : { line }),
})

const INDEX_ENTRY_OPTION = [{ entryPattern: '(?:^|[\\\\/])index\\.ts$' }]

ruleTester.run('entry-surface-or-unit', entrySurfaceOrUnit, {
  valid: [
    {
      name: 'Should_Pass_When_EntryOnlyReExports',
      code: `export { a } from './a.js'
export { b } from './b.js'`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_EntryOnlyDeclares',
      code: `export const a = 1`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_EntryReExportsWithUntrackedLocalHelper',
      code: `const helper = () => 1
export { a } from './a.js'
export { b } from './b.js'`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_EntryReExportsImportedNamespaceObject',
      code: `import { poll, stream } from './p.js'
export { a } from './a.js'
export const Daemon = { poll, stream } as const`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_EntryReExportsImportedNamespaceObjectWithAliasedProperty',
      code: `import { worker, supervisor, dynamicRuntime } from './x.js'
export { a } from './a.js'
export const run = { worker, supervisor, dynamic: dynamicRuntime } as const`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_EntryReExportsLazyLayerValue',
      code: `import { Layer } from 'effect'
import { Tag, make } from './x.js'
export { a } from './a.js'
export const XLive = Layer.effect(Tag, make)`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_EntryReExportsLayerValueWithGeneratorBody',
      code: `import { Effect, Layer } from 'effect'
import { Tag } from './x.js'
export { a } from './a.js'
export const XLive = Layer.effect(Tag, Effect.gen(function*() {
  const value = yield* Effect.succeed(1)
  return { value }
}))`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_EntryOnlyTypeReExports',
      code: `export type { T } from './t.js'
export interface I { x: number }`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_EntryReExportsBinderOfImportedName',
      code: `import { importedX } from './x.js'
export { a } from './a.js'
export const binder = importedX`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_EntryTypeDeclarationsAreNotBehaviour',
      code: `export type { T } from './t.js'
export interface I { x: number }
export type A = { x: number }`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_NonEntryReExportsNameItDeclares',
      code: `const a = 1
export { a }`,
      filename: 'daemon.executor.ts',
    },
    {
      name: 'Should_Pass_When_NonEntryReExportsTypeItDeclares',
      code: `interface A { x: number }
export { type A }`,
      filename: 'daemon.executor.ts',
    },
    {
      name: 'Should_Pass_When_NonEntryDeclaresWithoutReExporting',
      code: `export const a = 1
export function run() {
  return a
}`,
      filename: 'daemon.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_Once_When_EntryReExportsThenDeclares',
      code: `export { a } from './a.js'
export const b = 1`,
      filename: 'mod.ts',
      errors: [entryMixError('b', 2)],
    },
    {
      name: 'Should_Report_Once_When_EntryDeclaresThenReExports',
      code: `export const b = 1
export { a } from './a.js'`,
      filename: 'mod.ts',
      errors: [entryMixError("re-export of a from './a.js'", 2)],
    },
    {
      name: 'Should_Report_At_Definition_When_EntryReExportsTypeThenDeclares',
      code: `export type { T } from './t.js'
export const a = 1`,
      filename: 'mod.ts',
      errors: [entryMixError('a', 2)],
    },
    {
      name: 'Should_Report_When_EntryNamespaceObjectHasInlineFunction',
      code: `import { poll, stream } from './p.js'
export { a } from './a.js'
export const Daemon = { poll: () => 1, stream } as const`,
      filename: 'mod.ts',
      errors: [entryMixError('Daemon', 3)],
    },
    {
      name: 'Should_Report_When_EntryNamespaceObjectHasLiteralValue',
      code: `import { poll } from './p.js'
export { a } from './a.js'
export const Daemon = { poll, limit: 5 } as const`,
      filename: 'mod.ts',
      errors: [entryMixError('Daemon', 3)],
    },
    {
      name: 'Should_Report_When_EntryNamespaceObjectChunksLocalFunction',
      code: `const poll = () => 1
export { a } from './a.js'
export const Daemon = { poll } as const`,
      filename: 'mod.ts',
      errors: [entryMixError('Daemon', 3)],
    },
    {
      name: 'Should_Report_When_EntryValueInvokesEffectAtModuleScope',
      code: `import { Effect } from 'effect'
export { a } from './a.js'
export const boot = Effect.runSync(Effect.succeed(1))`,
      filename: 'mod.ts',
      errors: [entryMixError('boot', 3)],
    },
    {
      name: 'Should_Report_When_EntryValueInvokesEffectThroughPipe',
      code: `import { Effect, pipe } from 'effect'
export { a } from './a.js'
export const boot = pipe(Effect.succeed(1), Effect.runSync)`,
      filename: 'mod.ts',
      errors: [entryMixError('boot', 3)],
    },
    {
      name: 'Should_Report_When_EntryLayerValueStretchesOverRunSyncArgument',
      code: `import { Effect, Layer } from 'effect'
import { Tag } from './x.js'
export { a } from './a.js'
export const XLive = Layer.effect(Tag, Effect.runSync(Effect.succeed(1)))`,
      filename: 'mod.ts',
      errors: [entryMixError('XLive', 4)],
    },
    {
      name: 'Should_Report_When_EntryDefaultExportsWithReExports',
      code: `export { a } from './a.js'
export default 1`,
      filename: 'mod.ts',
      errors: [entryMixError('default export', 2)],
    },
    {
      name: 'Should_Report_Only_NonEntryClause_When_CustomEntryPatternDoesNotJudgeModTs',
      code: `export { a } from './a.js'
export const b = 1`,
      filename: 'mod.ts',
      options: INDEX_ENTRY_OPTION,
      errors: [foreignReexportError("re-export of a from './a.js'", 1)],
    },
    {
      name: 'Should_Report_When_CustomEntryPatternJudgesIndexTs',
      code: `export { a } from './a.js'
export const b = 1`,
      filename: 'index.ts',
      options: INDEX_ENTRY_OPTION,
      errors: [entryMixError('b', 2)],
    },
    {
      name: 'Should_Report_Only_NonEntryClause_When_NonEntryHasBothMarks',
      code: `export { a } from './a.js'
export const b = 1`,
      filename: 'daemon.executor.ts',
      errors: [foreignReexportError("re-export of a from './a.js'", 1)],
    },
    {
      name: 'Should_Report_When_NonEntryReExportsForeignName',
      code: `export { a } from './a.js'`,
      filename: 'daemon.executor.ts',
      errors: [foreignReexportError("re-export of a from './a.js'")],
    },
    {
      name: 'Should_Report_When_NonEntryTypeOnlyReExportsForeignName',
      code: `export type { T } from './t.js'`,
      filename: 'daemon.executor.ts',
      errors: [foreignReexportError("re-export of T from './t.js'")],
    },
    {
      name: 'Should_Report_When_NonEntryReExportsTypeSpecifierOfForeignName',
      code: `export { type RegisterMode } from './r.js'`,
      filename: 'daemon.executor.ts',
      errors: [foreignReexportError("re-export of RegisterMode from './r.js'")],
    },
    {
      name: 'Should_Report_When_HarnessReExportsForeignName',
      code: `export { type RegisterMode } from './feature-runtime.kernel.js'`,
      filename: 'feature.harness.ts',
      errors: [foreignReexportError("re-export of RegisterMode from './feature-runtime.kernel.js'")],
    },
    {
      name: 'Should_Report_When_NonEntryReExportsImportedNameWithoutSource',
      code: `import { a } from './a.js'
export { a }`,
      filename: 'daemon.executor.ts',
      errors: [foreignReexportError('re-export of a', 2)],
    },
    {
      name: 'Should_Report_When_NonEntryNamespaceReExportsForeignNames',
      code: `export * as Ns from './n.js'`,
      filename: 'daemon.executor.ts',
      errors: [foreignReexportError("re-export of Ns from './n.js'")],
    },
    {
      name: 'Should_Report_When_NonEntryWildcardReExportsForeignNames',
      code: `export * from './w.js'`,
      filename: 'daemon.executor.ts',
      errors: [foreignReexportError("re-export of * from './w.js'")],
    },
    {
      name: 'Should_Report_When_EntryNamespaceReExportAccompaniesDefinition',
      code: `export * as Ns from './n.js'
export const b = 1`,
      filename: 'mod.ts',
      errors: [entryMixError('b', 2)],
    },
    {
      name: 'Should_Report_Once_Per_Statement_When_NonEntryCarriesTwoForeignReExports',
      code: `export { a } from './a.js'
export { b } from './b.js'`,
      filename: 'daemon.executor.ts',
      errors: [
        foreignReexportError("re-export of a from './a.js'", 1),
        foreignReexportError("re-export of b from './b.js'", 2),
      ],
    },
  ],
})
