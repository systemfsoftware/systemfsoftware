import type { Mutant, MutantResult, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Ignorer } from '@systemfsoftware/stryker-js-plugin-api/ignore'
import type { ComposedPlugins } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { CompleteDryRunResult } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import type * as Effect from 'effect/Effect'

import type { ExitClass } from '../exit-classification.js'
import type { TestCoverage } from '../mutants/test-coverage.js'
import type { Project } from '../project/index.js'
import type { Sandbox } from '../sandbox/sandbox.js'
import type { Timer } from '../timer.js'

import type { PrepareExecutorArgs } from './1-prepare-executor.js'

/**
 * The run's stages, as four values rather than four calls.
 *
 * The container was already threading this chain and nobody named it:
 * `PrepareExecutor.execute` returned a child injector that the instrument
 * stage consumed, which returned another that the dry run consumed. Each
 * stage added the bindings the next one needed, so the order was real but
 * enforced by nothing — inverting two stages produced a missing-binding
 * failure at run time, from inside whichever stage happened to resolve first.
 *
 * Here each result type carries what the next stage's parameter demands, so an
 * inversion is a compile error that names the absent member.
 */

/**
 * What preparing the run produced.
 *
 * `plugins` is the composed plugin set, not the container's
 * `Map<PluginKind, Plugin[]>`. Carrying the map would relocate the token
 * rather than retire it, and it would drop `shadowings` — the list naming
 * every plugin another plugin displaced, which exists precisely so a
 * displaced plugin is reported instead of silently losing.
 */
export interface PrepareDone {
  readonly project: Project
  readonly plugins: ComposedPlugins
  readonly ignorers: readonly Ignorer[]
  readonly options: StrykerOptions
  readonly timer: Timer
  readonly temporaryDirectoryPath: string
}

/** Adds what the dry run reads. `dryRun(PrepareDone)` fails on `mutants` and `sandbox`. */
export interface InstrumentDone extends PrepareDone {
  readonly mutants: readonly Mutant[]
  readonly sandbox: Sandbox
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
 * `verdict` rides here rather than in process state. The score's comparison
 * against the breaking threshold happens in the engine, but the exit code is
 * the CLI's to set, so the verdict has to cross a package boundary — and it
 * used to do that through a module-scope `Set` that the engine added to and the
 * CLI read at teardown. That channel appeared in neither signature, was shared
 * by every run in the process, and was correct only if the reader ran after the
 * writer, which nothing expressed.
 *
 * `null` means the run reached a verdict and it was not a failure, or there was
 * no threshold to fail. A run that never got that far fails instead of
 * returning this.
 */
export interface RunOutcome {
  readonly results: readonly MutantResult[]
  readonly verdict: ExitClass | null
}

/**
 * Each stage is an `Effect`, never a `Promise`. A `Promise` here would undo the
 * reason the engine moved: the work has already started by the time the value
 * exists, so the run could not be timed out, retried or interrupted, and the
 * two schedulers that caused the orphaned-process defect would still both be
 * live. The error and requirement channels are the stage's own; the composition
 * root discharges them.
 */
export type PrepareStage<E, R> = (args: PrepareExecutorArgs) => Effect.Effect<PrepareDone, E, R>
export type InstrumentStage<E, R> = (prev: PrepareDone) => Effect.Effect<InstrumentDone, E, R>
export type DryRunStage<E, R> = (prev: InstrumentDone) => Effect.Effect<DryRunDone, E, R>
export type MutationTestStage<E, R> = (prev: DryRunDone) => Effect.Effect<readonly MutantResult[], E, R>
