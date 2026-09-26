import { Schema } from 'effect'

const ProbeVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-readiness/ProbeVerdict')
type ProbeVerdictTypeId = typeof ProbeVerdictTypeId

export class Satisfied extends Schema.TaggedClass<Satisfied>()('Satisfied', {}) {
  readonly [ProbeVerdictTypeId] = ProbeVerdictTypeId
}

export class NotYet extends Schema.TaggedClass<NotYet>()('NotYet', {}) {
  readonly [ProbeVerdictTypeId] = ProbeVerdictTypeId
}

export const ProbeVerdict = Schema.Union([Satisfied, NotYet])
export type ProbeVerdict = typeof ProbeVerdict.Type
