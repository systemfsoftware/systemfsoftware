import os from 'os'

import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import * as Effect from 'effect/Effect'

export const computeTotalConcurrency = (
  concurrencyOption: number | string | undefined,
  availableParallelism: number,
): number => {
  if (typeof concurrencyOption === 'string') {
    const percentageMatch = concurrencyOption.match(/^(100|[1-9]?[0-9])%$/)
    if (percentageMatch?.[1] !== undefined) {
      const percentage = Number.parseInt(percentageMatch[1], 10)
      return Math.max(1, Math.round((availableParallelism * percentage) / 100))
    }
  }
  if (typeof concurrencyOption === 'number') {
    return concurrencyOption
  }
  return availableParallelism > 4 ? availableParallelism - 1 : availableParallelism
}

export const splitConcurrency = (
  total: number,
  checkerCount: number,
): { testRunners: number; checkers: number } => {
  if (checkerCount > 0) {
    return {
      checkers: Math.max(Math.ceil(total / 2), 1),
      testRunners: Math.max(Math.floor(total / 2), 1),
    }
  }
  return { testRunners: total, checkers: 0 }
}

export const computeConcurrency = (
  options: Pick<StrykerOptions, 'checkers' | 'concurrency'>,
  availableParallelism: number,
): { testRunners: number; checkers: number } => {
  const total = computeTotalConcurrency(options.concurrency, availableParallelism)
  return splitConcurrency(total, options.checkers.length)
}

export const makeConcurrency = (
  options: Pick<StrykerOptions, 'checkers' | 'concurrency'>,
  log: Logger,
): Effect.Effect<{ testRunners: number; checkers: number }> =>
  Effect.gen(function*() {
    const availableParallelism = yield* Effect.sync(() => os.availableParallelism())
    const total = computeTotalConcurrency(options.concurrency, availableParallelism)
    if (typeof options.concurrency === 'string') {
      const percentageMatch = options.concurrency.match(/^(100|[1-9]?[0-9])%$/)
      if (percentageMatch?.[1] !== undefined) {
        const percentage = Number.parseInt(percentageMatch[1], 10)
        const computed = Math.max(1, Math.round((availableParallelism * percentage) / 100))
        log.debug(
          'Computed concurrency %s from "%s" based on %s available parallelism.',
          computed,
          options.concurrency,
          availableParallelism,
        )
      }
    }
    const result = splitConcurrency(total, options.checkers.length)
    if (options.checkers.length > 0) {
      log.info(
        'Creating %s checker process(es) and %s test runner process(es).',
        result.checkers,
        result.testRunners,
      )
    } else {
      log.info('Creating %s test runner process(es).', result.testRunners)
    }
    return result
  })
