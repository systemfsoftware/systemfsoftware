import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import {
  MISSING_EDGE_ACTUAL,
  MISSING_EDGE_EXPECTED,
  MISSING_EDGE_FIX,
  MISSING_EDGE_NAME,
  MULTIPLE_EDGES_ACTUAL,
  MULTIPLE_EDGES_EXPECTED,
  MULTIPLE_EDGES_FIX,
} from '../entrypoint-interprets-once.config.js'
import { entrypointInterpretsOnce } from '../entrypoint-interprets-once.js'

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

const missingEdge = {
  name: MISSING_EDGE_NAME,
  expected: MISSING_EDGE_EXPECTED,
  actual: MISSING_EDGE_ACTUAL,
  fix: MISSING_EDGE_FIX,
}

const secondEdge = (name: string) => ({
  name,
  expected: MULTIPLE_EDGES_EXPECTED,
  actual: MULTIPLE_EDGES_ACTUAL,
  fix: MULTIPLE_EDGES_FIX,
})

ruleTester.run('entrypoint-interprets-once', entrypointInterpretsOnce, {
  valid: [
    {
      name: 'Should_Pass_When_EntrypointCallsBareRunMain',
      code: `runMain(program)`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_EntrypointCallsPlatformRunMain',
      code: `NodeRuntime.runMain(program)`,
      filename: 'src/main.ts',
    },
    {
      name: 'Should_Pass_When_EntrypointCallsNestedNamespaceRunMain',
      code: `Runtime.Node.runMain(program)`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_EntrypointCallsEffectRunPromise',
      code: `Effect.runPromise(program)`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_EntrypointMakesManagedRuntime',
      code: `const runtime = ManagedRuntime.make(AppLayer)`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_EntrypointBuildsLayerRuntime',
      code: `const runtime = Layer.toRuntime(AppLayer)`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_ManagedRuntimeIsUsedManyTimesAfterOneEdge',
      code: `const runtime = ManagedRuntime.make(AppLayer)
const first = runtime.runPromise(handle(a))
const second = runtime.runPromise(handle(b))`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_EntrypointWrapsRunMainInsideAFunction',
      code: `const boot = () => runMain(program)`,
      filename: 'main.ts',
    },
    {
      name: 'Should_Pass_When_FileIsNotAnEntrypoint',
      code: `export const program = Effect.succeed(1)`,
      filename: 'boot.executor.ts',
    },
    {
      name: 'Should_Pass_When_FilenameMerelyEndsWithMain',
      code: `export const program = Effect.succeed(1)`,
      filename: 'src/remain.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_EntrypointInterpretsNothing',
      code: `const program = Effect.succeed(1)`,
      filename: 'main.ts',
      errors: [{ messageId: 'missingEdge', data: missingEdge }],
    },
    {
      name: 'Should_Report_When_EntrypointOnlyCallsANonEdgeEffectMethod',
      code: `const program = Effect.map(source, double)`,
      filename: 'main.ts',
      errors: [{ messageId: 'missingEdge', data: missingEdge }],
    },
    {
      name: 'Should_Report_When_EntrypointCallsAnUnrelatedBareFunction',
      code: `start(program)`,
      filename: 'main.ts',
      errors: [{ messageId: 'missingEdge', data: missingEdge }],
    },
    {
      name: 'Should_Report_When_EntrypointCallsANonEdgeMethodOnANestedNamespace',
      code: `Runtime.Node.start(program)`,
      filename: 'main.ts',
      errors: [{ messageId: 'missingEdge', data: missingEdge }],
    },
    {
      name: 'Should_Report_When_RunMainIsReachedThroughComputedAccess',
      code: `platform[runMain](program)`,
      filename: 'main.ts',
      errors: [{ messageId: 'missingEdge', data: missingEdge }],
    },
    {
      name: 'Should_Report_When_RunMainIsAPrivateMethod',
      code: `class Boot {
  #runMain() {}
  start() {
    this.#runMain()
  }
}`,
      filename: 'main.ts',
      errors: [{ messageId: 'missingEdge', data: missingEdge }],
    },
    {
      name: 'Should_Report_BothEdges_When_EntrypointInterpretsTwice',
      code: `runMain(server)
Effect.runPromise(migrations)`,
      filename: 'main.ts',
      errors: [
        { messageId: 'multipleEdges', data: secondEdge('runMain') },
        { messageId: 'multipleEdges', data: secondEdge('Effect.runPromise') },
      ],
    },
    {
      name: 'Should_Report_BothEdges_When_PlatformRunMainWrapsASecondRuntime',
      code: `BunRuntime.runMain(program)
const runtime = ManagedRuntime.make(AppLayer)`,
      filename: 'main.ts',
      errors: [
        { messageId: 'multipleEdges', data: secondEdge('BunRuntime.runMain') },
        { messageId: 'multipleEdges', data: secondEdge('ManagedRuntime.make') },
      ],
    },
  ],
})
