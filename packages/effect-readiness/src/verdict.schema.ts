import { Schema } from 'effect'

export class Satisfied extends Schema.TaggedClass<Satisfied>()('Satisfied', {}) {}

export class TimedOut extends Schema.TaggedClass<TimedOut>()('TimedOut', {}) {}

export const ReadinessVerdict = Schema.Union([Satisfied, TimedOut])
export type ReadinessVerdict = typeof ReadinessVerdict.Type
