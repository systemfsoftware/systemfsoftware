import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { Cell } from '@systemfsoftware/effect-cell-types'

import { launderedCellServiceInvalidCases } from '../no-laundered-cell-service.corpus.js'
import { noLaunderedCellService } from '../no-laundered-cell-service.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

const CELL_IMPORT = `import { Cell } from '${Cell.vocabulary.module}'`
const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`

const CHECKER_CELL = `const checkCell = Cell.layer({
  read: (command) =>
    Effect.gen(function*() {
      const compiler = yield* TypeScriptCompiler
      return { compiler, command }
    }),
  decide: (raw) => raw,
  write: (outcome) => Effect.succeed(outcome),
})`

ruleTester.run('no-laundered-cell-service', noLaunderedCellService, {
  valid: [
    {
      name: 'Should_ReportNothing_When_ProvideSitsInTopLevelProgramScope',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${CHECKER_CELL}
export const program = Cell.run(checkCell, cmd).pipe(
  Effect.provideService(TypeScriptCompiler, compiler),
)`,
      filename: 'main.ts',
    },
    {
      name: 'Should_ReportNothing_When_ProvideTargetsARawEffectWithoutCellRun',
      code: `${EFFECT_IMPORT}
export const makeReporter = (params) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    return fs
  }).pipe(
    Effect.provideService(FileSystem.FileSystem, params.fs),
    Effect.provideService(Path.Path, params.path),
  )`,
      filename: 'reporter.adapter.ts',
    },
    {
      name: 'Should_ReportNothing_When_ProvidedServiceIsNotInTheCellR',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${CHECKER_CELL}
export const check = (mutants) =>
  Effect.gen(function*() {
    return yield* Cell.run(checkCell, mutants).pipe(
      Effect.provideService(UnrelatedService, impl),
    )
  })`,
      filename: 'checker.service.ts',
    },
    {
      name: 'Should_ReportNothing_When_CellRIsUnresolvable',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
import { checkCell } from './cells.js'
export const check = (mutants) =>
  Effect.gen(function*() {
    return yield* Cell.run(checkCell, mutants).pipe(
      Effect.provideService(TypeScriptCompiler, compiler),
    )
  })`,
      filename: 'checker.service.ts',
    },
    {
      name: 'Should_ReportNothing_When_ProvideCalleeIsAnAlias',
      code: `${CELL_IMPORT}
import * as Fx from 'effect/Effect'
${CHECKER_CELL}
export const check = (mutants) =>
  Effect.gen(function*() {
    return yield* Cell.run(checkCell, mutants).pipe(
      Fx.provideService(TypeScriptCompiler, compiler),
    )
  })`,
      filename: 'checker.service.ts',
    },
    {
      name: 'Should_ReportNothing_When_TopLevelLayerBuildIsProvided',
      code: `${EFFECT_IMPORT}
import * as Layer from 'effect/Layer'
export const program = Layer.build(base).pipe(
  Effect.provideService(RunConfiguration, config),
)`,
      filename: 'main.ts',
    },
  ],
  invalid: launderedCellServiceInvalidCases(Cell.vocabulary.module),
})
