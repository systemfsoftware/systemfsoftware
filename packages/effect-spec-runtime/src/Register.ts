import type { Vitest } from '@effect/vitest'
import { type Asserted, captureRunBinding } from '@effect/vitest/integration'
import { Effect, Option, Ref, Schema } from 'effect'
import { dual } from 'effect/Function'
import type * as Scope from 'effect/Scope'
import { describe } from 'vitest'
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
/**
 * One fork lane and the two mode variants that share its call signature. A lane is a
 * generator-body registrar, and every lane is scoped: the fork provides `Scope` around each test,
 * so a lane's requirement channel carries it whatever the layer adds.
 */
interface Lanes<R> {
  readonly run: Vitest.Test<R>
  readonly skip: Vitest.Test<R>
  readonly only: Vitest.Test<R>
}

const pickLane = <R>(lanes: Lanes<R>, mode: RegisterMode): Vitest.Test<R> =>
  ({ skip: lanes.skip, only: lanes.only, run: lanes.run })[mode]

/** The virtual-clock lane: the fork's own generator-body `it` and its two mode variants. */
const virtualLanes = (methodsIt: Vitest.Methods): Lanes<Scope.Scope> => ({
  run: methodsIt,
  skip: methodsIt.skip,
  only: methodsIt.only,
})

/** The live-clock lane: `it.live` and its two mode variants, which already carry `Scope`. */
const liveLanes = (methodsIt: Vitest.Methods): Lanes<Scope.Scope> => ({
  run: methodsIt.live,
  skip: methodsIt.live.skip,
  only: methodsIt.live.only,
})

/**
 * An explored case runs under the kernel's own clock, so it registers on the virtual lane; a
 * live-declared case keeps the real clock and registers on `it.live`.
 */
const caseLanes = (methodsIt: Vitest.Methods, live: LiveCase | undefined): Lanes<Scope.Scope> =>
  live === undefined ? virtualLanes(methodsIt) : liveLanes(methodsIt)

const scopedBody = Effect.scoped

/**
 * An explored case has no wall-clock limit: every run is bounded in steps, and
 * the kernel reports a hang (deadlock, runaway, or a wait it cannot observe)
 * deterministically. A timer would only measure how busy the machine is.
 */
export const UNTIMED = { timeout: 0 } as const

/**
 * One case's program under the kernel: the test's binding is re-provided onto it (the kernel
 * drives it in its own run, so the check ledger and the running Vitest task are handed over), the
 * run is scoped, and a failure reports its seed and decision path.
 */
export const exploredProgram = <A, E>(
  program: Effect.Effect<A, E, Scope.Scope>,
): Effect.Effect<void, E, Asserted> =>
  Effect.gen(function*() {
    const binding = yield* captureRunBinding
    const bound = binding.bind(program)
    return yield* Effect.promise(() => bound.pipe(scopedBody, KernelCase.explore))
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
): Vitest.Test<Scope.Scope> => pickLane(caseLanes(methodsIt, live), mode)

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
