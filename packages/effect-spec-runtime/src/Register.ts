/// <reference types="vitest/globals" />
/// <reference types="vitest/importMeta" />
import type { Vitest } from '@effect/vitest'
import { Effect, Match, Option } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import type { TestContext } from 'vitest'
import * as KernelCase from './KernelCase.js'
import type { LiveCase } from './KernelCase.js'
import type { Options } from './Suite.js'

export type RegisterMode = 'run' | 'skip' | 'only'

export type DescribeMode = 'describe' | 'skip' | 'only'

type DescribeMember = typeof describe | typeof describe.skip

const selectDescribe = (mode: DescribeMode): DescribeMember =>
  ({ skip: describe.skip, only: describe.only, describe })[mode]

const invokeDescribeImpl = (
  mode: DescribeMode,
  suiteName: string,
  suiteOpts: Options | undefined,
  fn: () => void,
): void =>
  Option.match(Option.fromUndefinedOr(suiteOpts), {
    onNone: () => {
      selectDescribe(mode)(suiteName, fn)
    },
    onSome: (options) => {
      selectDescribe(mode)(suiteName, options, fn)
    },
  })

/**
 * Keeps the caller's suite options verbatim when present; a suite declared
 * without options is registered through the two-argument collector call.
 */
export const invokeDescribe: {
  (mode: DescribeMode, suiteName: string, suiteOpts: Options | undefined): (fn: () => void) => void
  (mode: DescribeMode, suiteName: string, suiteOpts: Options | undefined, fn: () => void): void
} = dual(4, invokeDescribeImpl)
const pickTester = <R>(family: Vitest.Tester<R>, mode: RegisterMode): Vitest.Test<R> =>
  ({ skip: family.skip, only: family.only, run: family })[mode]

const exploredBody = <A, E>(
  body: (ctx: TestContext) => Effect.Effect<A, E, Scope.Scope>,
): (ctx: TestContext) => Promise<void> =>
(ctx) => KernelCase.explore(Effect.scoped(body(ctx)))

const skipKernel = (methodsIt: Vitest.Methods): Vitest.Test<Scope.Scope> => (name) => {
  methodsIt.skip(name, () => undefined)
}

const runKernel = (methodsIt: Vitest.Methods): Vitest.Test<Scope.Scope> => (name, body) => {
  methodsIt(name, exploredBody(body))
}

const onlyKernel = (methodsIt: Vitest.Methods): Vitest.Test<Scope.Scope> => (name, body) => {
  methodsIt.only(name, exploredBody(body))
}

const registerKernelCase = (methodsIt: Vitest.Methods, mode: RegisterMode): Vitest.Test<Scope.Scope> =>
  Match.value(mode).pipe(
    Match.when('skip', () => skipKernel(methodsIt)),
    Match.when('only', () => onlyKernel(methodsIt)),
    Match.when('run', () => runKernel(methodsIt)),
    Match.exhaustive,
  )
/**
 * A live-declared case runs on the live clock as before; a case without a
 * live declaration runs under the kernel, exploring the profile's schedules.
 */
const selectCaseRunnerImpl = (
  methodsIt: Vitest.Methods,
  mode: RegisterMode,
  live: LiveCase | undefined,
): Vitest.Test<Scope.Scope> => {
  if (live !== undefined) return pickTester(methodsIt.live, mode)
  return registerKernelCase(methodsIt, mode)
}

export const selectCaseRunner: {
  (mode: RegisterMode, live: LiveCase | undefined): (methodsIt: Vitest.Methods) => Vitest.Test<Scope.Scope>
  (methodsIt: Vitest.Methods, mode: RegisterMode, live: LiveCase | undefined): Vitest.Test<Scope.Scope>
} = dual(3, selectCaseRunnerImpl)
