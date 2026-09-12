import type { StrykerOptions } from '@systemfsoftware/stryker-js/Options'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Ref from 'effect/Ref'

export interface IdGeneratorShape {
  readonly next: Effect.Effect<number>
}

export class IdGenerator extends Context.Service<IdGenerator, IdGeneratorShape>()(
  '@systemfsoftware/stryker-js-cli/run/IdGenerator',
) {}

export const makeIdGenerator: Effect.Effect<IdGeneratorShape> = Effect.gen(function*() {
  const ref = yield* Ref.make(0)
  return {
    next: Ref.getAndUpdate(ref, (n) => n + 1),
  }
})

export const layer = Layer.effect(IdGenerator)(makeIdGenerator)

const ASSUMED_PARALLELISM = 4

const reportedParallelism = (): number | undefined => {
  if (typeof globalThis.navigator === 'undefined') return undefined
  return globalThis.navigator.hardwareConcurrency
}

export const getAvailableParallelism = (): number => {
  const reported = reportedParallelism()
  if (typeof reported !== 'number') return ASSUMED_PARALLELISM
  return reported
}

const PERCENTAGE_OPTION = /^(100|[1-9]?[0-9])%$/

type ConcurrencyDetails = { readonly total: number; readonly isPercentage: boolean }

const percentageOf = (text: string): number | undefined =>
  Option.fromNullishOr(PERCENTAGE_OPTION.exec(text)?.[1]).pipe(
    Option.map((digits) => Number.parseInt(digits, 10)),
    Option.getOrUndefined,
  )

const defaultedTotal = (availableParallelism: number): number =>
  Match.value(availableParallelism > 4).pipe(
    Match.when(true, () => availableParallelism - 1),
    Match.orElse(() => availableParallelism),
  )

const unsetDetails = (availableParallelism: number): ConcurrencyDetails => ({
  total: defaultedTotal(availableParallelism),
  isPercentage: false,
})

const percentageDetails = (text: string, availableParallelism: number): ConcurrencyDetails =>
  Match.value(percentageOf(text)).pipe(
    Match.when(Predicate.isNumber, (percentage): ConcurrencyDetails => ({
      total: Math.max(1, Math.round((availableParallelism * percentage) / 100)),
      isPercentage: true,
    })),
    Match.orElse(() => unsetDetails(availableParallelism)),
  )

export const computeTotalConcurrencyDetails = (
  concurrencyOption: number | string | undefined,
  availableParallelism: number,
): ConcurrencyDetails =>
  Match.value(concurrencyOption).pipe(
    Match.when(Predicate.isString, (text) => percentageDetails(text, availableParallelism)),
    Match.when(Predicate.isNumber, (total): ConcurrencyDetails => ({ total, isPercentage: false })),
    Match.orElse(() => unsetDetails(availableParallelism)),
  )

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

const announcePercentage = (resolved: {
  readonly option: number | string | undefined
  readonly total: number
  readonly isPercentage: boolean
  readonly availableParallelism: number
}): Effect.Effect<void> =>
  Match.value(resolved.isPercentage).pipe(
    Match.when(true, () =>
      Effect.logDebug(
        `Computed concurrency ${resolved.total} from "${resolved.option}" based on ${resolved.availableParallelism} available parallelism.`,
      )),
    Match.orElse(() => Effect.void),
  )

const announceProcesses = (
  split: { readonly checkers: number; readonly testRunners: number },
): Effect.Effect<void> =>
  Match.value(split.checkers > 0).pipe(
    Match.when(true, () =>
      Effect.logInfo(
        `Creating ${split.checkers} checker process(es) and ${split.testRunners} test runner process(es).`,
      )),
    Match.orElse(() => Effect.logInfo(`Creating ${split.testRunners} test runner process(es).`)),
  )

export const makeConcurrency = (
  options: Pick<StrykerOptions, 'checkers' | 'concurrency'>,
): Effect.Effect<{ testRunners: number; checkers: number }> =>
  Effect.gen(function*() {
    const availableParallelism = yield* Effect.sync(getAvailableParallelism)
    const { total, isPercentage } = computeTotalConcurrencyDetails(options.concurrency, availableParallelism)
    yield* announcePercentage({
      option: options.concurrency,
      total,
      isPercentage,
      availableParallelism,
    })
    const result = splitConcurrency(total, options.checkers.length)
    yield* announceProcesses(result)
    return result
  })
