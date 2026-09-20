import { FastCheck as fc } from 'effect/testing'

const isStrykerWorker = typeof process !== 'undefined' && process.env['STRYKER_MUTATOR_WORKER'] !== undefined
const isCi = typeof process !== 'undefined' && process.env['CI'] === 'true'

const numRunsFromCi = (): number => {
  if (isCi) return 1000
  return 100
}

const numRunsFromEnv = (): number => {
  if (isStrykerWorker) return 30
  return numRunsFromCi()
}

fc.configureGlobal({ numRuns: numRunsFromEnv() })
