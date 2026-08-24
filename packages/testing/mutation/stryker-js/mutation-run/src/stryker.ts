import type { MutantResult, PartialStrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import * as Clock from 'effect/Clock'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'

import { RunEnvironment, type RunEnvironmentShape } from './run-environment.js'
import type { RunPhase } from './run-event.js'
import type { DryRunStage, InstrumentStage, MutationTestStage, PrepareStage } from './run-stages/stage-results.js'

/**
 * The four stages, as values.
 *
 * The chain is one type: each stage's input is the previous stage's output, so
 * mis-ordering them is a compile error rather than a runtime one.
 *
 * A caller supplies them, which is what makes a run testable without a sandbox,
 * a child process or a plugin on disk — every dependency a stage needs arrives
 * as an argument or a requirement in its own signature.
 */
export interface MutationRunStages<E, R> {
  readonly prepare: PrepareStage<E, R>
  readonly instrument: InstrumentStage<E, R>
  readonly dryRun: DryRunStage<E, R>
  readonly mutationTest: MutationTestStage<E, R>
}

/**
 * Run mutation testing.
 *
 * Every phase event, and the elapsed time on it, comes from one sink and one
 * clock zero, both read once from `RunEnvironment`. The `Reporter` port exposes
 * no hook before the dry run, so `prepare` — the first observable moment of a
 * run — can only be announced from here.
 *
 * There is no `try`/`catch` and no `finally`. The container version disposed a
 * root injector in a `finally` and preserved the temp directory by reaching into
 * a child injector from a `catch` to set `removeDuringDisposal = false` on a
 * shared object. Both are scope concerns: a resource's lifetime belongs to the
 * scope that acquired it, and whether to keep the sandbox is a decision about
 * the run's `Exit`, which a finalizer can read without a mutable flag and
 * without the error having to travel through a second channel to be observed.
 *
 * Returns the results. It does not decide the process exit code, log the
 * failure, or render anything: those are the host's, and a library that does
 * them is a library you cannot embed.
 */
export const runMutationTest = <E, R>(
  stages: MutationRunStages<E, R>,
  cliOptions: PartialStrykerOptions,
  targetMutatePatterns?: string[],
): Effect.Effect<readonly MutantResult[], E, R | RunEnvironment> =>
  Effect.gen(function*() {
    const env = yield* RunEnvironment

    const emitPhase = (phase: RunPhase): Effect.Effect<void> =>
      Effect.gen(function*() {
        const now = yield* Clock.currentTimeMillis
        env.runEventSink({
          kind: 'phase',
          phase,
          elapsedMs: now - env.runStartedAt,
        })
      })
    yield* emitPhase('prepare')
    const prepared = yield* stages.prepare({ cliOptions, targetMutatePatterns })

    yield* emitPhase('instrument')
    const instrumented = yield* stages.instrument(prepared)

    yield* emitPhase('dry-run')
    const dryRun = yield* stages.dryRun(instrumented)

    yield* emitPhase('mutation-test')
    return yield* stages.mutationTest(dryRun)
  })

/**
 * Whether a finished run should leave its temp directory on disk.
 *
 * A pure decision over the run's outcome and one option, which is why it is
 * here and not inside a `catch`: a failed run's temp directory is the only
 * evidence left of what it was doing, and `cleanTempDir: 'always'` is the
 * caller saying they want it gone regardless.
 *
 * `cleanTempDir` is `'always' | boolean` in the option domain, so the three
 * cases are distinct and the literal is the one that overrides a failure.
 */
export const shouldKeepTempDir = (
  exit: Exit.Exit<unknown, unknown>,
  cleanTempDir: 'always' | boolean,
): boolean => Exit.isFailure(exit) && cleanTempDir !== 'always'

export type { RunEnvironmentShape }
