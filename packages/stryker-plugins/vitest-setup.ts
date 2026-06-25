import { FastCheck as fc } from 'effect'

const isStrykerWorker = typeof process !== 'undefined' && process.env['STRYKER_MUTATOR_WORKER'] !== undefined
const isCi = typeof process !== 'undefined' && process.env['CI'] === 'true'

const numRuns = isStrykerWorker ? 30 : isCi ? 1000 : 100

fc.configureGlobal({ numRuns })
