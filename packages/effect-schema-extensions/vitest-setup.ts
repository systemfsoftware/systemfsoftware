import { FastCheck as fc } from 'effect'

const isCi = typeof process !== 'undefined' && process.env['CI'] === 'true'

const numRuns = isCi ? 1000 : 100

fc.configureGlobal({ numRuns })
