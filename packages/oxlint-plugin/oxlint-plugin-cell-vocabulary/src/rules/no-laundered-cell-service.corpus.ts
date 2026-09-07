import type { RuleTester } from 'oxlint/plugins-dev'

const EFFECT_IMPORT = `import * as Effect from 'effect/Effect'`

const LAUNDERED_EXPECTED =
  'a Cell.run whose services ride the Cell R channel — the provide belongs at the service construction layer or in Cell.provide, never piped onto a per-call run'
const LAUNDERED_ACTUAL =
  'a provideService piped onto Cell.run hands the run a service its own Cell R already demands, inside a per-call closure'
const LAUNDERED_FIX =
  'hoist the provide to the surrounding service construction layer, or declare the service in the Cell R and eliminate it once with Cell.provide at the composition root; when the service is genuinely per-event, drop the Cell.run and keep the raw Effect provide; when nothing consumes the provided value, delete it'

const error = (tag: string) => ({
  messageId: 'launderedCellService' as const,
  data: {
    name: tag,
    expected: LAUNDERED_EXPECTED,
    actual: LAUNDERED_ACTUAL,
    fix: LAUNDERED_FIX,
  },
})

const CHECKER_CELL = `const checkCell = Cell.layer({
  read: (command) =>
    Effect.gen(function*() {
      const compiler = yield* TypeScriptCompiler
      return { compiler, command }
    }),
  decide: (raw) => raw,
  write: (outcome) => Effect.succeed(outcome),
})`

const RUNNER_CELL = `const mutantRunCell = Cell.layer({
  read: (command) =>
    Effect.gen(function*() {
      const harness = yield* VitestHarness
      return { harness, command }
    }),
  decide: (raw) => raw,
  write: (outcome) => Effect.succeed(outcome),
})`

export const launderedCellServiceInvalidCases = (cellModule: string): RuleTester.InvalidTestCase[] => {
  const cellImport = `import { Cell } from '${cellModule}'`
  return [
    {
      name: 'Should_Report_Provide_When_CheckerCellRMemberIsProvidedPerGroup',
      code: `${cellImport}
${EFFECT_IMPORT}
${CHECKER_CELL}
export const check = (mutants) =>
  Effect.gen(function*() {
    const applyOnce = (group) =>
      Cell.run(checkCell, group).pipe(
        Effect.provideService(TypeScriptCompiler, compiler),
      )
    return yield* applyOnce(mutants)
  })`,
      filename: 'checker.service.ts',
      errors: [error('TypeScriptCompiler')],
    },
    {
      name: 'Should_Report_Provide_When_RunnerCellRMemberIsProvidedPerCell',
      code: `import { pipe } from 'effect/Function'
${cellImport}
${EFFECT_IMPORT}
${RUNNER_CELL}
export const mutantRun = (options) =>
  pipe(
    Cell.run(mutantRunCell, options),
    Effect.provideService(VitestHarness, harnessImpl),
  )`,
      filename: 'runner.service.ts',
      errors: [error('VitestHarness')],
    },
    {
      name: 'Should_Report_Provide_When_RIsDeclaredByAnnotation',
      code: `${cellImport}
${EFFECT_IMPORT}
const annotated: Cell.Cell<Cmd, Resp, Err, Dep> = Cell.layer({
  read: (command) => Effect.succeed(command),
  decide: (raw) => raw,
  write: (outcome) => Effect.succeed(outcome),
})
export const run = (cmd) =>
  Effect.gen(function*() {
    return yield* Cell.run(annotated, cmd).pipe(
      Effect.provideService(Dep, impl),
    )
  })`,
      filename: 'run.executor.ts',
      errors: [error('Dep')],
    },
  ]
}
