import { Schema } from 'effect'
import { Satisfied } from './ProbeVerdict.schema.js'

/** The wait gave up at its deadline without a `Satisfied` pass. */
export const TimedOut = Schema.TaggedStruct('TimedOut', {})
export type TimedOut = typeof TimedOut.Type

/** The public result: a satisfied wait, or a timeout. */
export const ReadinessVerdict = Schema.Union([Satisfied, TimedOut])
export type ReadinessVerdict = typeof ReadinessVerdict.Type
