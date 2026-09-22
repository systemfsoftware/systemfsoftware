/// <reference types="vitest/globals" />
/// <reference types="vitest/importMeta" />
import type { Vitest } from '@effect/vitest'
import { Effect, Match, Option, Schema } from 'effect'
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

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  const testerRoutes: ReadonlyArray<[RegisterMode, Vitest.Test<Scope.Scope>]> = [
    ['run', it.effect],
    ['skip', it.effect.skip],
    ['only', it.effect.only],
  ]
  type DescribeMember = typeof describe | typeof describe.skip
  const describeRoutes: ReadonlyArray<[DescribeMode, DescribeMember]> = [
    ['describe', describe],
    ['skip', describe.skip],
    ['only', describe.only],
  ]
  const clockRoutes: ReadonlyArray<[boolean, Vitest.Tester<Scope.Scope>]> = [
    [true, it.live],
    [false, it.effect],
  ]

  it.prop('∀m_PickTester_=Routed', [Schema.Literals(['run', 'skip', 'only'])], ([mode]) =>
    Effect.sync(() => {
      const picked = pickTester(it.effect, mode)
      return testerRoutes.every(([route, tester]) => (picked === tester) === (route === mode))
    }))

  it.prop('∀m_SelectDescribe_=Routed', [Schema.Literals(['describe', 'skip', 'only'])], ([mode]) =>
    Effect.sync(() => {
      const selected = selectDescribe(mode)
      return describeRoutes.every(([route, collector]) => (selected === collector) === (route === mode))
    }))

  it.prop('∀b_CaseClockFamily_=Routed', [Schema.Boolean], ([useLiveClock]) =>
    Effect.sync(() => {
      const family = caseClockFamily(it, useLiveClock)
      return clockRoutes.every(([route, tester]) => (family === tester) === (route === useLiveClock))
    }))
}
