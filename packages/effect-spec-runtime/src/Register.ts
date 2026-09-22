/// <reference types="vitest/globals" />
/// <reference types="vitest/importMeta" />
import type { Vitest } from '@effect/vitest'
import { Effect, Schema } from 'effect'
import type * as Scope from 'effect/Scope'
import type { Options } from './Suite.js'

export type RegisterMode = 'run' | 'skip' | 'only'

export type DescribeMode = 'describe' | 'skip' | 'only'

const selectDescribe = (mode: DescribeMode) =>
  ({
    skip: describe.skip,
    only: describe.only,
    describe,
  })[mode]

export const invokeDescribe = (
  mode: DescribeMode,
  suiteName: string,
  suiteOpts: Options | undefined,
  fn: () => void,
): void => {
  const d = selectDescribe(mode)
  if (typeof suiteOpts === 'undefined') {
    d(suiteName, fn)
    return
  }
  d(suiteName, suiteOpts, fn)
}

const pickTester = <R>(family: Vitest.Tester<R>, mode: RegisterMode): Vitest.Test<R> =>
  ({
    skip: family.skip,
    only: family.only,
    run: family,
  })[mode]

export const selectCaseRunner = (
  methodsIt: Vitest.Methods,
  mode: RegisterMode,
  useLiveClock: boolean,
): Vitest.Test<Scope.Scope> => {
  if (useLiveClock) {
    return pickTester(methodsIt.live, mode)
  }
  return pickTester(methodsIt.effect, mode)
}

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
}
