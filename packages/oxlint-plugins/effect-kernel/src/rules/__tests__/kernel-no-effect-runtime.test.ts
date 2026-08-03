import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { RUN_CALL_EXPECTED, RUN_CALL_FIX } from '../kernel-no-effect-runtime.config.js'
import { kernelNoEffectRuntime } from '../kernel-no-effect-runtime.js'

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

const runCallData = (name: string) => ({
  name,
  expected: RUN_CALL_EXPECTED,
  actual: `a call to ${name}()`,
  fix: RUN_CALL_FIX,
})

ruleTester.run('kernel-no-effect-runtime', kernelNoEffectRuntime, {
  valid: [
    {
      name: 'Should_Pass_When_KernelBuildsEffectGenDescription',
      code: `export const jitter = (base: number): Effect.Effect<number> =>
  Effect.gen(function* () {
    return base * 2
  })`,
      filename: 'retry.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelBuildsEffectSyncDescription',
      code: `export const now = (clock: { now: () => number }): Effect.Effect<number> =>
  Effect.sync(clock.now)`,
      filename: 'retry.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelPipesOverEffectValues',
      code: `export const square = (effect: Effect.Effect<number>): Effect.Effect<number> =>
  pipe(effect, Effect.map((n) => n * n))`,
      filename: 'retry.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelImportsEffectBarrel',
      code: `import { Effect, pipe } from 'effect'
export const doubled = (n: number): Effect.Effect<number> => Effect.sync(() => n * 2)`,
      filename: 'retry.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelReferencesRunSyncWithoutCalling',
      code: `export const runner = Effect.runSync`,
      filename: 'retry.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelCallsLocalFunctionNamedRunSync',
      code: `export const go = (): number => {
  const runSync = (f: () => number): number => f()
  return runSync(() => 1)
}`,
      filename: 'retry.kernel.ts',
    },
    {
      name: 'Should_Pass_When_UnknownObjectCallsRunSync',
      code: `const x = Other.runSync(effect)`,
      filename: 'retry.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ComputedAccessBreaksTheChain',
      code: `const x = Effect['runSync'](effect)`,
      filename: 'retry.kernel.ts',
    },
    {
      name: 'Should_Pass_When_EffectMapIsNotARunCall',
      code: `const x = Effect.map(effect, (n) => n + 1)`,
      filename: 'retry.kernel.ts',
    },
    {
      name: 'Should_Pass_When_RunNamespaceIsReferencedButNotCalled',
      code: `const x = Run.run`,
      filename: 'retry.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorRunsEffect',
      code: `const result = Effect.runSync(paymentEffect)`,
      filename: 'process-claim.executor.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorRunsThroughRuntime',
      code: `const result = await Runtime.runPromise(program)`,
      filename: 'process-claim.executor.ts',
    },
    {
      name: 'Should_Pass_When_HandlerRunsEffect',
      code: `Effect.runFork(program)`,
      filename: 'cancel-order.handler.ts',
    },
    {
      name: 'Should_Pass_When_AdapterRunsEffect',
      code: `const result = Effect.runSync(chargeCard)`,
      filename: 'stripe.adapter.ts',
    },
    {
      name: 'Should_Pass_When_NonKernelFileRunsEffect',
      code: `Effect.runSync(effect)`,
      filename: 'index.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_KernelCallsEffectRunSync',
      code: `const result = Effect.runSync(effect)`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Effect.runSync') }],
    },
    {
      name: 'Should_Report_When_KernelCallsEffectRunPromise',
      code: `const result = Effect.runPromise(effect)`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Effect.runPromise') }],
    },
    {
      name: 'Should_Report_When_KernelCallsEffectRunFork',
      code: `Effect.runFork(effect)`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Effect.runFork') }],
    },
    {
      name: 'Should_Report_When_KernelCallsEffectRunCallback',
      code: `Effect.runCallback(effect, { onExit: () => {} })`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Effect.runCallback') }],
    },
    {
      name: 'Should_Report_When_KernelCallsEffectRunSyncExit',
      code: `const exit = Effect.runSyncExit(effect)`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Effect.runSyncExit') }],
    },
    {
      name: 'Should_Report_When_KernelCallsEffectRunPromiseExit',
      code: `const exit = Effect.runPromiseExit(effect)`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Effect.runPromiseExit') }],
    },
    {
      name: 'Should_Report_When_KernelCallsRunRun',
      code: `const result = Run.run(effect)`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Run.run') }],
    },
    {
      name: 'Should_Report_When_KernelCallsRunRunSync',
      code: `const result = Run.runSync(effect)`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Run.runSync') }],
    },
    {
      name: 'Should_Report_When_KernelCallsRuntimeRunSync',
      code: `const result = Runtime.runSync(effect)`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Runtime.runSync') }],
    },
    {
      name: 'Should_Report_When_KernelCallsRuntimeRunPromise',
      code: `const result = Runtime.runPromise(effect)`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Runtime.runPromise') }],
    },
    {
      name: 'Should_Report_When_KernelCallsRuntimeRunFork',
      code: `Runtime.runFork(effect)`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Runtime.runFork') }],
    },
    {
      name: 'Should_Report_When_KernelCallsRunSyncInsideFunction',
      code: `export const execute = <A>(effect: Effect.Effect<A>): A => {
  return Effect.runSync(effect)
}`,
      filename: 'retry.kernel.ts',
      errors: [{ messageId: 'effectRunCall', data: runCallData('Effect.runSync') }],
    },
  ],
})
