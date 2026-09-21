import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  DEFAULT_EXPORT,
  ENTRYPOINT_EXPORT_ACTUAL,
  ENTRYPOINT_EXPORT_EXPECTED,
  ENTRYPOINT_EXPORT_FIX,
  NAMED_EXPORT,
  STAR_EXPORT,
} from '../entrypoint-no-exports.config.js'
import { entrypointNoExports } from '../entrypoint-no-exports.js'

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

const exported = (name: string) => ({
  name,
  expected: ENTRYPOINT_EXPORT_EXPECTED,
  actual: ENTRYPOINT_EXPORT_ACTUAL,
  fix: ENTRYPOINT_EXPORT_FIX,
})

ruleTester.run('entrypoint-no-exports', entrypointNoExports, {
  valid: [
    {
      name: 'Should_Pass_When_EntrypointOnlyInterprets',
      code: `runMain(program)`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_EntrypointHoldsLocalBindings',
      code: `const layer = Layer.mergeAll(StoreLive, ClockLive)
runMain(program.pipe(Effect.provide(layer)))`,
      filename: 'src/main.ts',
    },
    {
      name: 'Should_Pass_When_EntrypointImportsWithoutExporting',
      code: `import { program } from './boot.executor.js'
runMain(program)`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_FileIsNotAnEntrypoint',
      code: `export const run = () => Effect.succeed(1)`,
      filename: 'daemon.executor.ts',
    },
    {
      name: 'Should_Pass_When_FilenameMerelyEndsWithMain',
      code: `export const run = () => Effect.succeed(1)`,
      filename: 'src/domain.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_EntrypointExportsAConst',
      code: `export const run = () => Effect.succeed(1)`,
      filename: 'main.ts',
      errors: [{ messageId: 'entrypointExport', data: exported(NAMED_EXPORT) }],
    },
    {
      name: 'Should_Report_When_EntrypointExportsAType',
      code: `export type { LeaderLockOptions } from './lock.schema.js'`,
      filename: 'main.ts',
      errors: [{ messageId: 'entrypointExport', data: exported(NAMED_EXPORT) }],
    },
    {
      name: 'Should_Report_When_EntrypointReExportsNamedBindings',
      code: `export { run, worker } from './supervisor.executor.js'`,
      filename: 'main.ts',
      errors: [{ messageId: 'entrypointExport', data: exported(NAMED_EXPORT) }],
    },
    {
      name: 'Should_Report_When_EntrypointExportsDefault',
      code: `export default program`,
      filename: 'main.ts',
      errors: [{ messageId: 'entrypointExport', data: exported(DEFAULT_EXPORT) }],
    },
    {
      name: 'Should_Report_When_EntrypointReExportsEverything',
      code: `export * from './supervisor.executor.js'`,
      filename: 'main.ts',
      errors: [{ messageId: 'entrypointExport', data: exported(STAR_EXPORT) }],
    },
    {
      name: 'Should_Report_EachExport_When_EntrypointIsALibrary',
      code: `export const run = () => Effect.succeed(1)
export default run
export * from './supervisor.executor.js'`,
      filename: 'main.ts',
      errors: [
        { messageId: 'entrypointExport', data: exported(NAMED_EXPORT) },
        { messageId: 'entrypointExport', data: exported(DEFAULT_EXPORT) },
        { messageId: 'entrypointExport', data: exported(STAR_EXPORT) },
      ],
    },
  ],
})
