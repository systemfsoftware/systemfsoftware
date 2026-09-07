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

// Every axis value in the fixtures below is derived from the vocabulary at
// runtime, never spelled: the import's module name comes from Cell.vocabulary, and the
// message's expected data comes from the same config import the rule uses. If the
// derivation is severed, the expected data no longer matches the rendered message and
// the invalid fixtures stop reporting.
const CELL_IMPORT = `import { Cell } from '${Cell.vocabulary.module}'`
const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`

const error = (name: string) =>
  ({
    messageId: 'provideServiceOnRun',
    data: {
      name,
      expected: PROVIDE_SERVICE_ON_RUN_EXPECTED,
      actual: PROVIDE_SERVICE_ON_RUN_ACTUAL,
      fix: PROVIDE_SERVICE_ON_RUN_FIX,
    },
  }) as const

ruleTester.run('no-platform-provide-service-on-run', noPlatformProvideServiceOnRun, {
  valid: [
    {
      // The sanctioned service-method edge: the provision wraps a gen body that merely
      // yields the run inside. The run sits behind a function boundary, so the
      // provisioned expression holds no run of its own. A walker that descends through
      // closures reports this provision.
      name: 'Should_ReportNothing_When_ProvideServiceWrapsGenThatYieldsRunInside',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.gen(function* () {
  const a = yield* Cell.run(cellA, x)
  return a
}).pipe(Effect.provideService(Service, live))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_ProvideServiceTargetsPlainServiceCall',
      code: `${EFFECT_IMPORT}
const program = fetchUser(id).pipe(Effect.provideService(Service, live))`,
      filename: 'confirm-order.executor.ts',
    },
    {
      // The composing provision carries a different member name, so it never matches —
      // and the bare run it leaves behind is a single run over a provided cell.
      name: 'Should_ReportNothing_When_CellProvideComposesLayer',
      code: `${CELL_IMPORT}
const provided = Cell.provide(cellA, layer)
const program = Cell.run(provided, x)`,
      filename: 'confirm-order.executor.ts',
    },
    {
      name: 'Should_ReportNothing_When_LayerProvideComposesLayers',
      code: `const program = Layer.provide(MainLive, DepLive)`,
      filename: 'confirm-order.executor.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_Pipe_When_ProvideServiceFollowsRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Cell.run(cellA, x).pipe(Effect.provideService(Service, live))`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Effect.provideService')],
    },
    {
      name: 'Should_Report_ProvideService_When_DataFirstReceivesRun',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Effect.provideService(Cell.run(cellA, x), Service, live)`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Effect.provideService')],
    },
    {
      // The provision sits among other operators in the same pipe. A match that only
      // reads the first pipe argument misses it and the provision goes unreported.
      name: 'Should_Report_Pipe_When_ProvideServiceSitsAmongOtherOperators',
      code: `${CELL_IMPORT}
${EFFECT_IMPORT}
const program = Cell.run(cellA, x).pipe(
  Effect.map((a) => a),
  Effect.provideService(Service, live),
)`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Effect.provideService')],
    },
    {
      // The platform namespace arrives under an import alias. Only the member name
      // decides, so the provision still reports — under the written name.
      name: 'Should_Report_Pipe_When_PlatformNamespaceIsAliased',
      code: `${CELL_IMPORT}
import * as Eff from 'effect'
const program = Cell.run(cellA, x).pipe(Eff.provideService(Service, live))`,
      filename: 'confirm-order.executor.ts',
      errors: [error('Eff.provideService')],
    },
  ],
})
