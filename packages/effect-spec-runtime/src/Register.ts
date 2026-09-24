import { captureRunBinding } from '@effect/vitest'
import type { Vitest } from '@effect/vitest'
import { Effect, Option, Ref, Schema } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import { describe } from 'vitest'
import type { TestContext } from 'vitest'
import * as KernelCase from './KernelCase.js'
import type { LiveCase } from './KernelCase.js'
import type { Options } from './Suite.js'
import * as TaskRef from './TaskRef.service.js'

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

const scopedBody = Effect.scoped

/**
 * An explored case has no wall-clock limit: every run is bounded in steps, and
 * the kernel reports a hang (deadlock, runaway, or a wait it cannot observe)
 * deterministically. A timer would only measure how busy the machine is.
 */
export const UNTIMED = { timeout: 0 } as const

export const exploredBody = <A, E>(
  program: Effect.Effect<A, E, Scope.Scope>,
): (ctx: TestContext) => Effect.Effect<void> =>
(ctx) =>
  Effect.gen(function*() {
    const binding = yield* captureRunBinding
    const bound = binding.bind(TaskRef.provideTaskRef(program, ctx))
    yield* Effect.promise(() => bound.pipe(scopedBody, KernelCase.explore))
  })

/**
 * A live-declared case runs on the live clock as before; a case without a
 * live declaration runs under the kernel, exploring the profile's schedules
 * through the fork's Effect lane.
 */
const selectCaseRunnerImpl = (
  methodsIt: Vitest.Methods,
  mode: RegisterMode,
  live: LiveCase | undefined,
): Vitest.Test<Scope.Scope> => pickTester(live === undefined ? methodsIt.effect : methodsIt.live, mode)

export const selectCaseRunner: {
  (mode: RegisterMode, live: LiveCase | undefined): (methodsIt: Vitest.Methods) => Vitest.Test<Scope.Scope>
  (methodsIt: Vitest.Methods, mode: RegisterMode, live: LiveCase | undefined): Vitest.Test<Scope.Scope>
} = dual(3, selectCaseRunnerImpl)

if (import.meta.vitest !== void 0) {
  // Dynamic: tsdown defines `import.meta.vitest` as `undefined`, so a static import would enter the published graph.
  const { it } = await import('@effect/vitest')

  const BodyOutcome = Schema.Literals(['success', 'failure', 'unscoped'])

  const expectsRelease = (outcome: typeof BodyOutcome.Type): boolean => outcome !== 'unscoped'

  /**
   * The release a body observes under the case scope: `scopedBody` releases the
   * resource for a body that succeeds or fails, while a body the scope never
   * wrapped has nothing to release. That base case is what pins the release to
   * the drawn outcome, so a constant stand-in for the subject cannot satisfy it.
   */
  const scopedRelease = (outcome: 'success' | 'failure'): Effect.Effect<boolean> =>
    Effect.gen(function*() {
      const released = yield* Ref.make(false)
      const resource = Effect.acquireRelease(
        Effect.succeed('the case resource'),
        () => Ref.set(released, true),
      )
      const body = outcome === 'success'
        ? resource
        : resource.pipe(Effect.andThen(Effect.fail('the case body failed')))
      yield* Effect.exit(scopedBody(body))
      return yield* Ref.get(released)
    })

  const releasedWhenScoped = (outcome: typeof BodyOutcome.Type): Effect.Effect<boolean> =>
    outcome === 'unscoped' ? Effect.succeed(false) : scopedRelease(outcome)

  it.effect.prop(
    '∀outcome_ScopedBody_=TheScopedEnvironmentIsReleased',
    { of: [BodyOutcome], subject: releasedWhenScoped },
    (scoped, [outcome]) => Effect.map(scoped(outcome), (released) => released === expectsRelease(outcome)),
  )
}
