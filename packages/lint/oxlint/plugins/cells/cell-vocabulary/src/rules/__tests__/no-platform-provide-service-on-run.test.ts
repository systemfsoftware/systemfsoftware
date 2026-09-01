import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { Cell } from '@systemfsoftware/effect-cell-types'

import {
  PLATFORM_PROVIDE_SERVICE_ACTUAL,
  PLATFORM_PROVIDE_SERVICE_EXPECTED,
  PLATFORM_PROVIDE_SERVICE_FIX,
} from '../no-platform-provide-service-on-run.config.js'
import { noPlatformProvideServiceOnRun } from '../no-platform-provide-service-on-run.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

const CELL_IMPORT = `import { Cell } from '${Cell.vocabulary.module}'`
const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`
const FS_IMPORT = `import * as FileSystem from 'effect/FileSystem'`
const PATH_IMPORT = `import * as Path from 'effect/Path'`

const error = (tag: string, callee = 'Effect.provideService') =>
  ({
    messageId: 'platformProvideServiceOnRun',
    data: {
      name: `${callee}(${tag}, …)`,
      expected: PLATFORM_PROVIDE_SERVICE_EXPECTED,
      actual: PLATFORM_PROVIDE_SERVICE_ACTUAL,
      fix: PLATFORM_PROVIDE_SERVICE_FIX,
    },
  }) as const

ruleTester.run('no-platform-provide-service-on-run', noPlatformProvideServiceOnRun, {
  valid: [
    {
      name: 'Should_ReportNothing_When_LayerProvidedAfterOneRun',
      code: `${CELL_IMPORT}
const c = Cell.layer({ read: (i) => i })
export const runMutationTest = (args) => Cell.run(c, args).pipe(Effect.provide(hostLayer))
`,
    },
    {
      name: 'Should_ReportNothing_When_CellProvideAtCompositionRoot',
      code: `${CELL_IMPORT}
import { pipe } from 'effect'
const c = Cell.layer({ read: (i) => i })
export const provided = pipe(c, Cell.provide(layer))
`,
    },
    {
      name: 'Should_ReportNothing_When_AdapterTagProvidedOnRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
import { VitestHarness } from './Runner.js'
const dryRunCell = Cell.layer({ read: (i) => i })
const run = (options, harnessImpl) =>
  Cell.run(dryRunCell, options).pipe(
    Effect.provideService(VitestHarness, harnessImpl),
  )
`,
    },
    {
      name: 'Should_ReportNothing_When_LayerSucceedAtRoot',
      code: `${EFFECT_IMPORT}
${FS_IMPORT}
import * as Layer from 'effect/Layer'
const build = (fs) => Layer.succeed(FileSystem.FileSystem, fs)
`,
    },
    {
      name: 'Should_ReportNothing_When_PhaseYieldsFileSystem',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${FS_IMPORT}
const c = Cell.layer({
  read: (i) =>
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      return i
    }),
})
`,
    },
    {
      name: 'Should_ReportNothing_When_ProvideServiceOnHelperResult',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${FS_IMPORT}
const helper = (c, i) => Cell.run(c, i)
const c1 = Cell.layer({ read: (i) => i })
const run = (fs) => helper(c1, { id: '1' }).pipe(Effect.provideService(FileSystem.FileSystem, fs))
`,
    },
    {
      name: 'Should_ReportNothing_When_MethodRunForm',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${FS_IMPORT}
const cell = Cell.layer({ read: (i) => i })
const run = (fs) => cell.run({ id: '1' }).pipe(Effect.provideService(FileSystem.FileSystem, fs))
`,
    },
    {
      name: 'Should_ReportNothing_When_ProvideServiceAliased',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${FS_IMPORT}
const myProvide = Effect.provideService
const c = Cell.layer({ read: (i) => i })
const run = (fs) => Cell.run(c, { id: '1' }).pipe(myProvide(FileSystem.FileSystem, fs))
`,
    },
  ],
  invalid: [
    {
      // byte-faithful provideService pipe from packages/testing/mutation/stryker-js/html-reporter/src/Reporter.ts lines 68-70
      name: 'Should_ReportPerTag_When_ReporterPipeProvidesBoth',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${FS_IMPORT}
${PATH_IMPORT}
const htmlReporterCell = Cell.layer({ read: (i) => i })
const params = { fs: {}, path: {} }
const onMutationTestReportReady = (report, metrics) =>
  Cell.run(htmlReporterCell, { report, metrics }).pipe(
    Effect.provideService(FileSystem.FileSystem, params.fs),
    Effect.provideService(Path.Path, params.path),
  )
`,
      errors: [{ ...error('FileSystem.FileSystem'), line: 9 }, { ...error('Path.Path'), line: 10 }],
    },
    {
      name: 'Should_Report_When_DataFirstProvideServiceOnRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${FS_IMPORT}
const c = Cell.layer({ read: (i) => i })
const run = (fs) => Effect.provideService(Cell.run(c, { id: '1' }), FileSystem.FileSystem, fs)
`,
      errors: [{ ...error('FileSystem.FileSystem'), line: 5 }],
    },
    {
      name: 'Should_Report_When_NamedProvideServiceImport',
      code: `${CELL_IMPORT}
import { provideService } from 'effect/Effect'
${PATH_IMPORT}
const c = Cell.layer({ read: (i) => i })
const run = (p) => Cell.run(c, { id: '1' }).pipe(provideService(Path.Path, p))
`,
      errors: [{ ...error('Path.Path', 'provideService'), line: 5 }],
    },
    {
      name: 'Should_Report_When_NamedTagImport',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
import { FileSystem } from 'effect/FileSystem'
const c = Cell.layer({ read: (i) => i })
const run = (fs) => Cell.run(c, { id: '1' }).pipe(Effect.provideService(FileSystem, fs))
`,
      errors: [{ ...error('FileSystem'), line: 5 }],
    },
    {
      name: 'Should_Report_When_HelperBodyContainsChain',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${FS_IMPORT}
const c1 = Cell.layer({ read: (i) => i })
const runWithFs = (c, i, fs) => Cell.run(c, i).pipe(Effect.provideService(FileSystem.FileSystem, fs))
`,
      errors: [{ ...error('FileSystem.FileSystem'), line: 5 }],
    },
    {
      name: 'Should_Report_When_NamedPipeRootedAtRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
import { pipe } from 'effect'
${FS_IMPORT}
const c = Cell.layer({ read: (i) => i })
const run = (fs) => pipe(Cell.run(c, { id: '1' }), Effect.provideService(FileSystem.FileSystem, fs))
`,
      errors: [{ ...error('FileSystem.FileSystem'), line: 6 }],
    },
  ],
})
