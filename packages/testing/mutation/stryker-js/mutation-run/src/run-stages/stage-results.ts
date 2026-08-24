import type { Mutant, MutantResult, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { IgnorerService } from '@systemfsoftware/stryker-js-plugin-api/ignore'
import type { ComposedPlugins } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { CompleteDryRunResult } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import type * as Effect from 'effect/Effect'

import type { ExitClass } from '../exit-classification.js'
import type { TestCoverage } from '../mutants/test-coverage.js'
import type { LoadedPlugins } from '../plugins/plugin-loader.js'
import type { Project } from '../project/index.js'
import type { SandboxHandle } from '../sandbox/sandbox.js'
import type { Timer } from '../timer.js'

import type { PrepareExecutorArgs } from './1-prepare-executor.js'

/**
 * The run's stages, as four values.
 *
 * Each result type carries what the next stage's parameter demands, so an
 * inversion is a compile error that names the absent member.
 */

export interface PrepareDone {
  readonly project: Project
  readonly plugins: ComposedPlugins
  readonly loadedPlugins: LoadedPlugins
  readonly ignorers: readonly IgnorerService[]
  readonly options: StrykerOptions
  readonly timer: Timer
  readonly temporaryDirectoryPath: string
}

/** Adds what the dry run reads. `dryRun(PrepareDone)` fails on `mutants` and `sandbox`. */
export interface InstrumentDone extends PrepareDone {
  readonly mutants: readonly Mutant[]
  readonly sandbox: SandboxHandle
  /**
   * How many test runners and checkers this run may hold at once.
   *
   * Decided here because instrumenting is what learns how much work there is,
   * and read by the next two stages, which size their pools from it. Carried as
   * a value rather than recomputed per stage so the two pools cannot disagree
   * about how much of the machine they are entitled to.
   */
  readonly concurrency: {
    readonly testRunners: number
    readonly checkers: number
  }
}

/**
 * Adds the coverage artefacts mutation testing reads. `mutationTest(InstrumentDone)`
 * fails on `dryRunResult`, `testCoverage` and `timeOverheadMS`.
 */
export interface DryRunDone extends InstrumentDone {
  readonly dryRunResult: CompleteDryRunResult
  readonly testCoverage: TestCoverage
  readonly timeOverheadMS: number
}

/**
 * What a finished run hands back.
 *
 * The verdict travels in the signature, scoped to one run, so comparing the
 * score against the breaking threshold and setting the exit code are separate
 * steps with no shared mutable state.
 */
export interface RunOutcome {
  readonly results: readonly MutantResult[]
  readonly verdict: ExitClass | null
}

/**
 * Each stage is an `Effect`, never a `Promise`.
 */
export type PrepareStage<E, R> = (args: PrepareExecutorArgs) => Effect.Effect<PrepareDone, E, R>
export type InstrumentStage<E, R> = (prev: PrepareDone) => Effect.Effect<InstrumentDone, E, R>
export type DryRunStage<E, R> = (prev: InstrumentDone) => Effect.Effect<DryRunDone, E, R>
export type MutationTestStage<E, R> = (prev: DryRunDone) => Effect.Effect<readonly MutantResult[], E, R>
