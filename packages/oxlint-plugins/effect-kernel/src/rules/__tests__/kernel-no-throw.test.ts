import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { kernelNoThrow } from '../kernel-no-throw.js'

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

const throwData = {
  name: 'throw',
  expected: 'a total function returning the failure as data (Option.none, Either.left, or a result value)',
  actual: 'a thrown exception',
  fix: 'return the failure as a value so every call path stays total — a kernel never throws',
}

ruleTester.run('kernel-no-throw', kernelNoThrow, {
  valid: [
    {
      name: 'Should_Pass_When_KernelHasNoThrow',
      code: `export const sumBy = <A>(xs: readonly A[], f: (a: A) => number): number =>
  xs.reduce((n, a) => n + f(a), 0)`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelReturnsOptionNoneInsteadOfThrowing',
      code: `export const head = <A>(xs: readonly A[]): Option.Option<A> =>
  xs.length === 0 ? Option.none() : Option.some(xs[0])`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_KernelConstructsEffectDescription',
      code: `export const retryJitter = (base: number): Effect.Effect<number> =>
  Effect.sync(() => base * 2)`,
      filename: 'fold.kernel.ts',
    },
    {
      name: 'Should_Pass_When_ExecutorThrows',
      code: `if (!config.apiKey) throw new Error('missing api key')`,
      filename: 'process-claim.executor.ts',
    },
    {
      name: 'Should_Pass_When_WorkflowThrows',
      code: `if (order.total < 0) throw new Error('negative total')`,
      filename: 'process-claim.workflow.ts',
    },
    {
      name: 'Should_Pass_When_StoreThrows',
      code: `throw new Error('row not found')`,
      filename: 'order.store.ts',
    },
    {
      name: 'Should_Pass_When_NonKernelFileThrows',
      code: `throw new Error('boom')`,
      filename: 'index.ts',
    },
    {
      name: 'Should_Pass_When_KernelFileHasNoStatements',
      code: '',
      filename: 'fold.kernel.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_When_KernelThrows',
      code: `throw new Error('boom')`,
      filename: 'fold.kernel.ts',
      errors: [{ messageId: 'throwStatement', data: throwData }],
    },
    {
      name: 'Should_Report_When_KernelThrowsInsideFunction',
      code: `export const parse = (raw: string): number => {
  if (raw === '') throw new Error('empty input')
  return Number(raw)
}`,
      filename: 'parse.kernel.ts',
      errors: [{ messageId: 'throwStatement', data: throwData }],
    },
    {
      name: 'Should_Report_When_KernelRethrowsInCatch',
      code: `export const safe = (f: () => number): number => {
  try {
    return f()
  } catch (e) {
    throw e
  }
}`,
      filename: 'safe.kernel.ts',
      errors: [{ messageId: 'throwStatement', data: throwData }],
    },
  ],
})
