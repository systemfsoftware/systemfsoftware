import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  CELL_NAMESPACE,
  EAGER_CONSTRUCTION_ACTUAL,
  EAGER_CONSTRUCTION_EXPECTED,
  EAGER_CONSTRUCTION_FIX,
  LAYER_NAMESPACE,
  MAKE_MEMBER,
  MANAGED_RUNTIME_NAMESPACE,
  PROVIDE_MEMBER,
  WIRING_PER_CALL_ACTUAL,
  WIRING_PER_CALL_EXPECTED,
  WIRING_PER_CALL_FIX,
} from '../runtime-construction-placement.config.js'
import { runtimeConstructionPlacement } from '../runtime-construction-placement.js'

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

const MANAGED_RUNTIME_MAKE = `${MANAGED_RUNTIME_NAMESPACE}.${MAKE_MEMBER}`
const LAYER_PROVIDE = `${LAYER_NAMESPACE}.${PROVIDE_MEMBER}`
const CELL_PROVIDE = `${CELL_NAMESPACE}.${PROVIDE_MEMBER}`

const wiringPerCall = (name: string) => ({
  messageId: 'wiringPerCall',
  data: {
    name,
    expected: WIRING_PER_CALL_EXPECTED,
    actual: WIRING_PER_CALL_ACTUAL,
    fix: WIRING_PER_CALL_FIX,
  },
})

const eagerConstruction = {
  messageId: 'eagerConstruction',
  data: {
    name: MANAGED_RUNTIME_MAKE,
    expected: EAGER_CONSTRUCTION_EXPECTED,
    actual: EAGER_CONSTRUCTION_ACTUAL,
    fix: EAGER_CONSTRUCTION_FIX,
  },
} as const

ruleTester.run('runtime-construction-placement', runtimeConstructionPlacement, {
  valid: [
    {
      // Kills the mutant that reports every construction inside any function.
      name: 'Should_Pass_When_TheBootstrapClosureMakesTheRuntimeLazily',
      code: `import { ManagedRuntime } from 'effect'

let runtime
export const getRuntime = () => (runtime ??= ManagedRuntime.make(AppLive))`,
      filename: 'src/AppRuntime.ts',
    },
    {
      // Kills the mutant that stops the module-scope walk at the first closure it
      // meets, refusing to cross the invoked factory that wraps the memoizer.
      name: 'Should_Pass_When_TheMemoizedThunkIsReturnedFromAnInvokedFactory',
      code: `import { ManagedRuntime } from 'effect'

export const getRuntime = (() => {
  let runtime
  return () => (runtime ??= ManagedRuntime.make(AppLive))
})()`,
      filename: 'src/AppRuntime.ts',
    },
    {
      // Kills the mutant that exempts only a closure assigned directly to a
      // module-scope binding, missing the deferred callback inside the initializer.
      name: 'Should_Pass_When_TheDynamicImportBootstrapMakesTheRuntime',
      code: `import { ManagedRuntime } from 'effect'

export const runtime = import('./AppLive.js').then((module) => ManagedRuntime.make(module.AppLive))`,
      filename: 'src/AppRuntime.ts',
    },
    {
      // Kills the mutant that reports module-scope provision as wiring-per-call.
      name: 'Should_Pass_When_TheModuleScopeGraphProvidesTheLayerAndTheCell',
      code: `import { Layer } from 'effect'
import { Cell } from '@systemfsoftware/effect-cell-types'

export const configured = Layer.provide(Cell.provide(verdictCell, ledgerLayer), baseLayer)`,
      filename: 'src/AppLive.ts',
    },
    {
      name: 'Should_Pass_When_TheBootstrapClosureProvidesTheLayerGraph',
      code: `import { Layer } from 'effect'
import { ManagedRuntime } from 'effect'

export const getRuntime = () => ManagedRuntime.make(Layer.provide(AppLive, baseLayer))`,
      filename: 'src/AppRuntime.ts',
    },
    {
      // Kills the mutant that keys on the `run` member text and bans cell
      // application outside the entrypoint.
      name: 'Should_Pass_When_TheComposedCellIsAppliedInsideAFunction',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'

export const handler = (input) => Cell.andThen(verdictCell, ledgerCell).run(input)`,
      filename: 'src/Output.ts',
    },
    {
      // Kills the mutant that reports the application of a cell inside an Effect
      // program, or exempts no generator body at all.
      name: 'Should_Pass_When_TheCellIsAppliedInsideAnEffectGen',
      code: `import { Effect } from 'effect'

export const program = Effect.gen(function* () {
  const result = yield* verdictCell.run(command)
  return result
})`,
      filename: 'src/program.ts',
    },
    {
      // Kills the mutant that keys on the identifier `Cell` instead of resolving
      // the import specifier.
      name: 'Should_Pass_When_TheCellNamespaceComesFromAnotherModule',
      code: `import { Cell } from './ledger-cell.js'

export function build() {
  return Cell.provide(ledgerCell, ledgerLayer)
}`,
      filename: 'src/ledger.ts',
    },
    {
      name: 'Should_Pass_When_TheLayerNamespaceComesFromAnotherModule',
      code: `import { Layer } from './layer-kit.js'

export function build(base) {
  return Layer.provide(AppLive, base)
}`,
      filename: 'src/ledger.ts',
    },
    {
      // Kills the mutant that reports every member of a tracked namespace.
      name: 'Should_Pass_When_TheMemberIsNotATrackedConstructor',
      code: `import { Layer } from 'effect'

export function build(base) {
  return Layer.mergeAll(base, other)
}`,
      filename: 'src/AppLive.ts',
    },
    {
      // Kills the mutant that guesses the member name from a subscript
      // identifier: `Cell[provide]` names a member nothing static can read.
      name: 'Should_Pass_When_TheComputedMemberIsAVariable',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'

export function build(provide) {
  return Cell[provide](verdictCell, ledgerLayer)
}`,
      filename: 'src/ledger.ts',
    },
    {
      // Kills the mutant that matches the member on any receiver rather than on a
      // receiver that resolves to the package namespace.
      name: 'Should_Pass_When_TheReceiverIsNotANamespaceBinding',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'

export function build() {
  return Cell.layer({ read, decide, write }).provide(ledgerLayer)
}`,
      filename: 'src/ledger.ts',
    },
    {
      // Test files are in scope, and the deferred shape is lawful inside one.
      name: 'Should_Pass_When_ATestFileDefersItsRuntimeToAModuleScopeThunk',
      code: `import { ManagedRuntime } from 'effect'

let runtime
const getRuntime = () => (runtime ??= ManagedRuntime.make(AppLive))

test('verdicts', () => getRuntime().runPromise(verdict()))`,
      filename: 'src/verdict.integration.test.ts',
    },
    {
      name: 'Should_Pass_When_AConstructionIsAProbeInATypeTestFile',
      code: `import { ManagedRuntime } from 'effect'

expect(ManagedRuntime.make(AppLive)).type.toBe<ManagedRuntime.ManagedRuntime<AppLive, never>>()`,
      filename: '/repo/pkg/test-types/Cell.tst.ts',
    },
    {
      // Kills the mutant that reports the runner-contracted edge: vitest imports
      // this module once per process, so composition here is once per process.
      name: 'Should_Pass_When_TheRunnerHookEdgeComposesAtModuleScope',
      code: `import { ManagedRuntime } from 'effect'

const runtime = ManagedRuntime.make(AppLive)

runtime.runPromise(program)`,
      filename: 'src/global-setup.ts',
    },
    {
      // Kills the mutant that designates only the runner hook: the process entry
      // is this fleet's other runner-contracted edge.
      name: 'Should_Pass_When_TheProcessEntryComposesAtModuleScope',
      code: `import { ManagedRuntime } from 'effect'

const runtime = ManagedRuntime.make(AppLive)

runtime.runPromise(program)`,
      filename: 'src/main.ts',
    },
    {
      // Kills the mutant that reads the basename with the POSIX separator alone:
      // the path reaching the rule is the host's, and the host may be Windows.
      name: 'Should_Pass_When_TheEdgePathUsesTheBackslashSeparator',
      code: `import { ManagedRuntime } from 'effect'

const runtime = ManagedRuntime.make(AppLive)`,
      filename: 'C:\\repo\\pkg\\global-setup.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_TheRuntimeIsMadeInsideAFunctionDeclaration',
      code: `import { ManagedRuntime } from 'effect'

export function handle(request) {
  const runtime = ManagedRuntime.make(AppLive)
  return runtime.runPromise(serve(request))
}`,
      filename: 'src/Handler.ts',
      errors: [wiringPerCall(MANAGED_RUNTIME_MAKE)],
    },
    {
      name: 'Should_Report_When_TheLayerIsProvidedInsideAFunctionDeclaration',
      code: `import { Layer } from 'effect'

export function build(base) {
  return Layer.provide(AppLive, base)
}`,
      filename: 'src/AppLive.ts',
      errors: [wiringPerCall(LAYER_PROVIDE)],
    },
    {
      name: 'Should_Report_When_TheCellIsProvidedInsideAFunctionDeclaration',
      code: `import { Cell } from '@systemfsoftware/effect-cell-types'

export function build() {
  return Cell.provide(verdictCell, ledgerLayer)
}`,
      filename: 'src/ledger.ts',
      errors: [wiringPerCall(CELL_PROVIDE)],
    },
    {
      // Kills the mutant that exempts every module-scope binding initializer.
      name: 'Should_Report_When_TheRuntimeIsMadeAtModuleScope',
      code: `import { ManagedRuntime } from 'effect'

export const runtime = ManagedRuntime.make(AppLive)`,
      filename: 'src/AppRuntime.ts',
      errors: [eagerConstruction],
    },
    {
      // Kills the mutant that inspects only module-scope declarator initializers.
      name: 'Should_Report_When_TheRuntimeIsMadeInAModuleScopeExpressionStatement',
      code: `import { ManagedRuntime } from 'effect'

await ManagedRuntime.make(AppLive)`,
      filename: 'src/AppRuntime.ts',
      errors: [eagerConstruction],
    },
    {
      // Kills the mutant that resolves by identifier text: an alias is still the
      // package's `ManagedRuntime` export.
      name: 'Should_Report_When_TheAliasedImportMakesTheRuntimeInsideAFunction',
      code: `import { ManagedRuntime as Managed } from 'effect'

export function boot() {
  return Managed.make(AppLive)
}`,
      filename: 'src/boot.ts',
      errors: [wiringPerCall(MANAGED_RUNTIME_MAKE)],
    },
    {
      // Kills the mutant that resolves only a direct import binding and misses a
      // member taken off the package namespace.
      name: 'Should_Report_When_TheNamespaceImportProvidesTheLayerInsideAFunction',
      code: `import * as Eff from 'effect'

export function build() {
  return Eff.Layer.provide(AppLive, baseLayer)
}`,
      filename: 'src/AppLive.ts',
      errors: [wiringPerCall(LAYER_PROVIDE)],
    },
    {
      name: 'Should_Report_When_TheNamespaceImportProvidesTheCellInsideAFunction',
      code: `import * as CellTypes from '@systemfsoftware/effect-cell-types'

export function build() {
  return CellTypes.provide(verdictCell, ledgerLayer)
}`,
      filename: 'src/ledger.ts',
      errors: [wiringPerCall(CELL_PROVIDE)],
    },
    {
      // Kills the mutant that drops the string arm of the imported name.
      name: 'Should_Report_When_TheStringNamedImportMakesTheRuntime',
      code: `import { 'ManagedRuntime' as Managed } from 'effect'

export function boot() {
  return Managed.make(AppLive)
}`,
      filename: 'src/boot.ts',
      errors: [wiringPerCall(MANAGED_RUNTIME_MAKE)],
    },
    {
      // Kills the mutant that resolves imports but not a module-scope alias of one.
      name: 'Should_Report_When_TheModuleScopeAliasMakesTheRuntime',
      code: `import { ManagedRuntime } from 'effect'

const Runtime = ManagedRuntime

export function boot() {
  return Runtime.make(AppLive)
}`,
      filename: 'src/boot.ts',
      errors: [wiringPerCall(MANAGED_RUNTIME_MAKE)],
    },
    {
      // Kills the mutant that reads only the non-computed property position.
      name: 'Should_Report_When_TheComputedStaticMemberProvidesTheLayer',
      code: `import { Layer } from 'effect'

export function build() {
  return Layer['provide'](AppLive, baseLayer)
}`,
      filename: 'src/AppLive.ts',
      errors: [wiringPerCall(LAYER_PROVIDE)],
    },
    {
      // Kills the mutant that exempts a generator body because it sits inside a
      // module-scope binding initializer.
      name: 'Should_Report_When_TheCellIsProvidedInsideAGeneratorBodyAtModuleScope',
      code: `import { Effect } from 'effect'
import { Cell } from '@systemfsoftware/effect-cell-types'

export const program = Effect.gen(function* () {
  return yield* Cell.provide(verdictCell, ledgerLayer)
})`,
      filename: 'src/program.ts',
      errors: [wiringPerCall(CELL_PROVIDE)],
    },
    {
      // Kills the mutant that exempts every module-scope closure: a closure handed
      // to a module-scope call is not the deferred bootstrap binding.
      name: 'Should_Report_When_TheRuntimeIsMadeInAModuleScopeCallbackArgument',
      code: `import { ManagedRuntime } from 'effect'

let runtime
beforeEach(() => {
  runtime = ManagedRuntime.make(AppLive)
})`,
      filename: 'src/verdict.integration.test.ts',
      errors: [wiringPerCall(MANAGED_RUNTIME_MAKE)],
    },
    {
      name: 'Should_Report_When_ATestFileBuildsTheRuntimePerTest',
      code: `import { ManagedRuntime } from 'effect'

test('serves one request', () => {
  const runtime = ManagedRuntime.make(AppLive)
  return runtime.runPromise(serve())
})`,
      filename: 'src/verdict.integration.test.ts',
      errors: [wiringPerCall(MANAGED_RUNTIME_MAKE)],
    },
    {
      // Kills the mutant that inspects only function declarations and arrows.
      name: 'Should_Report_When_TheRuntimeIsMadeInsideAMethodBody',
      code: `import { ManagedRuntime } from 'effect'

export class Boot {
  start() {
    return ManagedRuntime.make(AppLive)
  }
}`,
      filename: 'src/boot.ts',
      errors: [wiringPerCall(MANAGED_RUNTIME_MAKE)],
    },
    {
      // Kills the mutant that exempts the edge module wholesale: the exemption
      // covers module-scope composition, never wiring built inside a call.
      name: 'Should_Report_When_TheRunnerHookEdgeBuildsTheRuntimeInsideAHook',
      code: `import { ManagedRuntime } from 'effect'

export function setup(project) {
  const runtime = ManagedRuntime.make(AppLive)
  project.provide('contract', runtime)
}`,
      filename: 'src/global-setup.ts',
      errors: [wiringPerCall(MANAGED_RUNTIME_MAKE)],
    },
    {
      // Kills the mutant that matches the edge name anywhere in the path rather
      // than the whole basename.
      name: 'Should_Report_When_TheBasenameOnlyEndsWithAnEdgeName',
      code: `import { ManagedRuntime } from 'effect'

const runtime = ManagedRuntime.make(AppLive)`,
      filename: 'src/my-global-setup.ts',
      errors: [eagerConstruction],
    },
  ],
})
