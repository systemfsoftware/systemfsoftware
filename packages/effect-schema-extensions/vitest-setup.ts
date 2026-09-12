import { FastCheck as fc } from 'effect/testing'

const isCi = typeof process !== 'undefined' && process.env['CI'] === 'true'

const numRuns = isCi ? 1000 : 100

fc.configureGlobal({ numRuns })
