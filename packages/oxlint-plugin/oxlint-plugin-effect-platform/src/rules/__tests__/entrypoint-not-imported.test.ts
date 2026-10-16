import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  ENTRYPOINT_IMPORT_ACTUAL,
  ENTRYPOINT_IMPORT_EXPECTED,
  ENTRYPOINT_IMPORT_FIX,
} from '../entrypoint-not-imported.config.js'
import { entrypointNotImported } from '../entrypoint-not-imported.js'

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

const imported = (name: string) => ({
  name,
  expected: ENTRYPOINT_IMPORT_EXPECTED,
  actual: ENTRYPOINT_IMPORT_ACTUAL,
  fix: ENTRYPOINT_IMPORT_FIX,
})

ruleTester.run('entrypoint-not-imported', entrypointNotImported, {
  valid: [
    {
      name: 'Should_Pass_When_ImportingASiblingCell',
      code: `import { run } from './supervisor.executor.js'`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_ModuleNameOnlyContainsMain',
      code: `import { Order } from './domain.js'`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_ModuleNameEndsWithMainWithoutASeparator',
      code: `import { retry } from './remain.js'`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_ExportHasNoSource',
      code: `export const run = () => Effect.succeed(1)`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_DynamicImportSourceIsNotALiteral',
      code: `const loaded = import(resolvedPath)`,
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_DynamicImportSourceIsATemplate',
      code: 'const loaded = import(`./${name}/main.js`)',
      filename: 'mod.ts',
    },
    {
      name: 'Should_Pass_When_DynamicImportSourceIsNotAString',
      code: `const loaded = import(1)`,
      filename: 'mod.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_BarrelImportsTheEntrypoint',
      code: `import { run } from './main.js'`,
      filename: 'mod.ts',
      errors: [{ messageId: 'entrypointImport', data: imported('./main.js') }],
    },
    {
      name: 'Should_Report_When_ImportPathHasNoExtension',
      code: `import { run } from '../main'`,
      filename: 'src/nested/mod.ts',
      errors: [{ messageId: 'entrypointImport', data: imported('../main') }],
    },
    {
      name: 'Should_Report_When_BarrelReExportsNamedBindingsFromTheEntrypoint',
      code: `export { run, worker } from './main.js'`,
      filename: 'mod.ts',
      errors: [{ messageId: 'entrypointImport', data: imported('./main.js') }],
    },
    {
      name: 'Should_Report_When_BarrelReExportsEverythingFromTheEntrypoint',
      code: `export * from './main.js'`,
      filename: 'mod.ts',
      errors: [{ messageId: 'entrypointImport', data: imported('./main.js') }],
    },
    {
      name: 'Should_Report_When_TheEntrypointIsImportedDynamically',
      code: `const loaded = import('./main.mjs')`,
      filename: 'mod.ts',
      errors: [{ messageId: 'entrypointImport', data: imported('./main.mjs') }],
    },
    {
      name: 'Should_Report_When_ATestImportsTheEntrypoint',
      code: `import { run } from '../main.js'`,
      filename: 'src/__tests__/daemon.feature.test.ts',
      errors: [{ messageId: 'entrypointImport', data: imported('../main.js') }],
    },
    {
      name: 'Should_Report_When_TheEntrypointIsImportedByPackagePath',
      code: `import { run } from '@systemfsoftware/effect-daemon-spec/main'`,
      filename: 'mod.ts',
      errors: [
        { messageId: 'entrypointImport', data: imported('@systemfsoftware/effect-daemon-spec/main') },
      ],
    },
  ],
})
