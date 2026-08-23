import os from 'os'

import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Effect from 'effect/Effect'
import * as Semaphore from 'effect/Semaphore'

/**
 * Computes concurrency and owns the semaphores that gate worker pools.
 *
 * The old `ReplaySubject<number>` token stream is replaced by `Semaphore`:
 * `Pool` already owns worker lifetime, so a second scheduler for token
 * emission is unnecessary. The checker and test-runner pools share the
 * underlying permits — when checkers retire, their permits are returned to
 * the test-runner semaphore via `freeCheckers`.
 */
export class ConcurrencyTokenProvider {
  public readonly concurrencyTestRunners: number
  public readonly concurrencyCheckers: number

  /**
   * Semaphore gating test-runner workers. Size = `concurrencyTestRunners`
   * initially; grown by `freeCheckers` after the check phase.
   */
  public readonly testRunnerSemaphore: Semaphore.Semaphore

  /**
   * Semaphore gating checker workers. Created only when `checkers.length > 0`.
   */
  public readonly checkerSemaphore: Semaphore.Semaphore

  constructor(
    private readonly options: Pick<StrykerOptions, 'checkers' | 'concurrency'>,
    private readonly log: Logger,
  ) {
    const availableParallelism = os.availableParallelism()
    const concurrency = this.computeConcurrency(options.concurrency, availableParallelism)

    if (options.checkers.length > 0) {
      this.concurrencyCheckers = Math.max(Math.ceil(concurrency / 2), 1)
      this.concurrencyTestRunners = Math.max(Math.floor(concurrency / 2), 1)
      this.log.info(
        'Creating %s checker process(es) and %s test runner process(es).',
        this.concurrencyCheckers,
        this.concurrencyTestRunners,
      )
    } else {
      this.concurrencyCheckers = 0
      this.concurrencyTestRunners = concurrency
      this.log.info('Creating %s test runner process(es).', this.concurrencyTestRunners)
    }

    // Semaphore creation is effectful; `makeUnsafe` is used here because the
    // provider itself is constructed outside an Effect context (legacy call
    // sites). New call sites should prefer `makeEffect`.
    this.testRunnerSemaphore = Semaphore.makeUnsafe(this.concurrencyTestRunners)
    this.checkerSemaphore = Semaphore.makeUnsafe(Math.max(this.concurrencyCheckers, 1))
  }

  /**
   * Effect constructor for new call sites that can stay inside Effect.
   */
  static make(
    options: Pick<StrykerOptions, 'checkers' | 'concurrency'>,
    log: Logger,
  ): Effect.Effect<ConcurrencyTokenProvider> {
    return Effect.sync(() => new ConcurrencyTokenProvider(options, log))
  }

  private computeConcurrency(
    concurrencyOption: number | string | undefined,
    availableParallelism: number,
  ): number {
    if (typeof concurrencyOption === 'string') {
      const percentageMatch = concurrencyOption.match(/^(100|[1-9]?[0-9])%$/)
      if (percentageMatch?.[1] !== undefined) {
        const percentage = Number.parseInt(percentageMatch[1], 10)
        const computed = Math.max(1, Math.round((availableParallelism * percentage) / 100))
        this.log.debug(
          'Computed concurrency %s from "%s" based on %s available parallelism.',
          computed,
          concurrencyOption,
          availableParallelism,
        )
        return computed
      }
    }
    if (typeof concurrencyOption === 'number') {
      return concurrencyOption
    }
    return availableParallelism > 4 ? availableParallelism - 1 : availableParallelism
  }

  /**
   * Called when the check phase completes. Returns the checker permits to the
   * test-runner pool so the run phase can use the full concurrency.
   */
  freeCheckers(): Effect.Effect<void> {
    if (this.concurrencyCheckers === 0) {
      return Effect.void
    }
    this.log.debug(
      'Checking done, creating %s additional test runner process(es)',
      this.concurrencyCheckers,
    )
    // Grow the test-runner semaphore to `concurrencyCheckers + concurrencyTestRunners`.
    // `Semaphore.resize` is the primitive that changes permit count.
    return this.testRunnerSemaphore.resize(this.concurrencyTestRunners + this.concurrencyCheckers)
  }

  /**
   * Dispose hook — no token subject to complete any more; semaphores are
   * reclaimed when the enclosing Scope closes.
   */
  dispose(): void {}
}
