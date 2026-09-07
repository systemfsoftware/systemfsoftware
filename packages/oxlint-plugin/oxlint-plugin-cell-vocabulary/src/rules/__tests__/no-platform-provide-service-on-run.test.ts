import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { Cell } from '@systemfsoftware/effect-cell-types'

import {
  PROVIDE_SERVICE_ON_RUN_ACTUAL,
  PROVIDE_SERVICE_ON_RUN_EXPECTED,
  PROVIDE_SERVICE_ON_RUN_FIX,
} from '../no-platform-provide-service-on-run.config.js'
import { noPlatformProvideServiceOnRun } from '../no-platform-provide-service-on-run.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester()

const CELL_IMPORT = `import { Cell } from '${Cell.vocabulary.module}'`
const CELL_NAMESPACE_IMPORT = `import * as Cell from '${Cell.vocabulary.module}'`
const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`
const EFFECT_BARE_IMPORT = `import * as Effect from 'effect'`
const LAYER_IMPORT = `import * as Layer from 'effect/Layer'`

const error = (service: string) =>
  ({
    messageId: 'provideServiceOnRun',
    data: {
      service,
      expected: PROVIDE_SERVICE_ON_RUN_EXPECTED,
      actual: PROVIDE_SERVICE_ON_RUN_ACTUAL,
      fix: PROVIDE_SERVICE_ON_RUN_FIX,
    },
  }) as const

ruleTester.run('no-platform-provide-service-on-run', noPlatformProvideServiceOnRun, {
  valid: [
    {
      name: 'Should_ReportNothing_When_PipedTopLevelRunMapsWithoutProvideService',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Cell.run(myCell, input).pipe(Effect.map((value) => value))`,
    },
    {
      name: 'Should_ReportNothing_When_CellProvideWrapsTheCell',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${LAYER_IMPORT}
const provided = Cell.provide(myCell, Layer.succeed('tag', 'value'))`,
    },
    {
      name: 'Should_ReportNothing_When_EffectProvideWrapsRunRootedChain',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${LAYER_IMPORT}
const program = Cell.run(myCell, input).pipe(Effect.provide(Layer.succeed('tag', 'value')))`,
    },
    {
      name: 'Should_ReportNothing_When_LayerProvideStandsAlone',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
${LAYER_IMPORT}
const program = Effect.succeed(input).pipe(Layer.provide(Layer.succeed('tag', 'value')))`,
    },
    {
      name: 'Should_ReportNothing_When_ProvideServiceTakesIntermediateVariable',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function*() {
  const run = Cell.run(myCell, input)
  return yield* Effect.provideService(run, MyService, impl)
})`,
    },
    {
      name: 'Should_ReportNothing_When_PlainEffectPipeProvidesService',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.succeed(input).pipe(Effect.provideService(MyService, impl))`,
    },
    {
      name: 'Should_ReportNothing_When_CellsAliasNearMissProvidesService',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const Cells = Cell
const program = Cells.run(myCell, input).pipe(Effect.provideService(MyService, impl))`,
    },
    {
      name: 'Should_ReportNothing_When_EffectAliasNearMissProvidesService',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const Eff = Effect
const program = Cell.run(myCell, input).pipe(Eff.provideService(MyService, impl))`,
    },
  ],
  invalid: [
    {
      name: 'Should_ReportOnce_When_CheckerPipeShapeProvidesService',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const applyOnce = (group) =>
  Cell.run(checkCell, new CheckMutantsCommand({ mutants: [...group] })).pipe(
    Effect.provideService(TypeScriptCompiler, compiler),
  )`,
      errors: [error('TypeScriptCompiler')],
    },
    {
      name: 'Should_ReportOnce_When_RunnerPipeShapeProvidesServiceBesideMapError',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const mutantRun = (options) =>
  Cell.run(mutantRunCell, options).pipe(
    Effect.provideService(VitestHarness, harnessImpl),
    Effect.mapError((cause) => new TestRunnerFailed({ cause })),
  )`,
      errors: [error('VitestHarness')],
    },
    {
      name: 'Should_ReportTwice_When_TwoServicePipeProvidesBoth',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Cell.run(myCell, input).pipe(
  Effect.provideService(Module, moduleService),
  Effect.provideService(FileSystem.FileSystem, fsService),
)`,
      errors: [error('Module'), error('FileSystem.FileSystem')],
    },
    {
      name: 'Should_ReportOnce_When_ProvideServiceSitsInSecondArgPosition',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Cell.run(myCell, Effect.provideService(MyService, impl))`,
      errors: [error('MyService')],
    },
    {
      name: 'Should_ReportOnce_When_ProvideServiceSitsInFirstArgPosition',
      code: `${CELL_IMPORT}
${EFFECT_BARE_IMPORT}
const program = Cell.run(Effect.provideService(MyService, impl), myCell)`,
      errors: [error('MyService')],
    },
    {
      name: 'Should_ReportOnce_When_CellNamespaceImportProvidesService',
      code: `${CELL_NAMESPACE_IMPORT}
${EFFECT_IMPORT}
const program = Cell.run(myCell, input).pipe(Effect.provideService(MyService, impl))`,
      errors: [error('MyService')],
    },
  ],
})
