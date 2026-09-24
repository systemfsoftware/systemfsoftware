import { Schema } from 'effect'
import { Satisfied } from './evaluate-probe.workflow.js'

/** The wait gave up at its deadline without a `Satisfied` pass. */
export class TimedOut extends Schema.TaggedClass<TimedOut>()('TimedOut', {}) {}

/** The public result: a satisfied wait, or a timeout. */
export const ReadinessVerdict = Schema.Union([Satisfied, TimedOut])
export type ReadinessVerdict = typeof ReadinessVerdict.Type
