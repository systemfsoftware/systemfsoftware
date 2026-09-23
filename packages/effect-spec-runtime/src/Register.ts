/// <reference types="vitest/globals" />
/// <reference types="vitest/importMeta" />
import type { Vitest } from '@effect/vitest'
import { Match, Option } from 'effect'
import type * as Scope from 'effect/Scope'
import type { Options } from './Suite.js'

export type RegisterMode = 'run' | 'skip' | 'only'

export type DescribeMode = 'describe' | 'skip' | 'only'

type DescribeMember = typeof describe | typeof describe.skip

const selectDescribe = (mode: DescribeMode): DescribeMember =>
  ({ skip: describe.skip, only: describe.only, describe })[mode]

/**
 * Keeps the caller's suite options verbatim when present; a suite declared
 * without options is registered through the two-argument collector call.
 */
export const invokeDescribe = (
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

export const selectCaseRunner = (
  methodsIt: Vitest.Methods,
  mode: RegisterMode,
  useLiveClock: boolean,
): Vitest.Test<Scope.Scope> => pickTester(caseClockFamily(methodsIt, useLiveClock), mode)

export const selectLayeredRunner = <R>(
  scopedIt: Pick<Vitest.MethodsNonLive<R>, 'effect'>,
  mode: RegisterMode,
): Vitest.Test<R | Scope.Scope> => pickTester(scopedIt.effect, mode)
