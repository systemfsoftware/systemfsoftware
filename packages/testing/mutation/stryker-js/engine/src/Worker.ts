import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Ref from 'effect/Ref'

export interface IdGeneratorShape {
  readonly next: Effect.Effect<number>
}

export class IdGenerator extends Context.Service<IdGenerator, IdGeneratorShape>()(
  '@systemfsoftware/stryker-js-engine/IdGenerator',
) {}

export const makeIdGenerator: Effect.Effect<IdGeneratorShape> = Effect.gen(function*() {
  const ref = yield* Ref.make(0)
  return {
    next: Ref.getAndUpdate(ref, (n) => n + 1),
  }
})

export const layer = Layer.effect(IdGenerator)(makeIdGenerator)

export const getAvailableParallelism = (): number => {
  if (typeof globalThis.navigator === 'undefined') return 4
  const hc = globalThis.navigator.hardwareConcurrency
  if (typeof hc !== 'number') return 4
  return hc
}

export const computeTotalConcurrencyDetails = (
  concurrencyOption: number | string | undefined,
  availableParallelism: number,
): { readonly total: number; readonly isPercentage: boolean } => {
  if (typeof concurrencyOption === 'string') {
    const percentageMatch = concurrencyOption.match(/^(100|[1-9]?[0-9])%$/)
    if (percentageMatch?.[1] !== undefined) {
      const percentage = Number.parseInt(percentageMatch[1], 10)
      return { total: Math.max(1, Math.round((availableParallelism * percentage) / 100)), isPercentage: true }
    }
  }
  if (typeof concurrencyOption === 'number') {
    return { total: concurrencyOption, isPercentage: false }
  }
  if (availableParallelism > 4) {
    return { total: availableParallelism - 1, isPercentage: false }
  }
  return { total: availableParallelism, isPercentage: false }
}

export const computeTotalConcurrency = (
  concurrencyOption: number | string | undefined,
  availableParallelism: number,
): number => computeTotalConcurrencyDetails(concurrencyOption, availableParallelism).total

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
): Effect.Effect<{ testRunners: number; checkers: number }> =>
  Effect.gen(function*() {
    const availableParallelism = yield* Effect.sync(getAvailableParallelism)
    const { total, isPercentage } = computeTotalConcurrencyDetails(options.concurrency, availableParallelism)
    if (isPercentage) {
      yield* Effect.logDebug(
        `Computed concurrency ${total} from "${options.concurrency}" based on ${availableParallelism} available parallelism.`,
      )
    }
    const result = splitConcurrency(total, options.checkers.length)
    if (options.checkers.length > 0) {
      yield* Effect.logInfo(
        `Creating ${result.checkers} checker process(es) and ${result.testRunners} test runner process(es).`,
      )
    } else {
      yield* Effect.logInfo(`Creating ${result.testRunners} test runner process(es).`)
    }
    return result
  })
