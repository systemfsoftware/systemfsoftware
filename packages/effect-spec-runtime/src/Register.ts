import type { Vitest } from '@effect/vitest'
import { Match, Option } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import { describe } from 'vitest'
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

/**
 * The live-clock case runner observes wall-clock time; the test-clock runner
 * shares the suite's controlled clock.
 */
const caseClockFamily = (methodsIt: Vitest.Methods, useLiveClock: boolean): Vitest.Tester<Scope.Scope> =>
  Match.value(useLiveClock).pipe(
    Match.when(true, () => methodsIt.live),
    Match.when(false, () => methodsIt.effect),
    Match.exhaustive,
  )

const selectCaseRunnerImpl = (
  methodsIt: Vitest.Methods,
  mode: RegisterMode,
  useLiveClock: boolean,
): Vitest.Test<Scope.Scope> => pickTester(caseClockFamily(methodsIt, useLiveClock), mode)

export const selectCaseRunner: {
  (mode: RegisterMode, useLiveClock: boolean): (methodsIt: Vitest.Methods) => Vitest.Test<Scope.Scope>
  (methodsIt: Vitest.Methods, mode: RegisterMode, useLiveClock: boolean): Vitest.Test<Scope.Scope>
} = dual(3, selectCaseRunnerImpl)

const selectLayeredRunnerImpl = <R>(
  scopedIt: Pick<Vitest.MethodsNonLive<R>, 'effect'>,
  mode: RegisterMode,
): Vitest.Test<R | Scope.Scope> => pickTester(scopedIt.effect, mode)

export const selectLayeredRunner: {
  <R>(mode: RegisterMode): (scopedIt: Pick<Vitest.MethodsNonLive<R>, 'effect'>) => Vitest.Test<R | Scope.Scope>
  <R>(scopedIt: Pick<Vitest.MethodsNonLive<R>, 'effect'>, mode: RegisterMode): Vitest.Test<R | Scope.Scope>
} = dual(2, selectLayeredRunnerImpl)
