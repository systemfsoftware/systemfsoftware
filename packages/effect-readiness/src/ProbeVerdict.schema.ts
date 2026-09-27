import { Schema } from 'effect'

const ProbeVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-readiness/ProbeVerdict')
type ProbeVerdictTypeId = typeof ProbeVerdictTypeId

/**
 * One pass's judgement that the probe observed the condition — and the verdict the public
 * `awaitCondition` hands back when the wait ends. One class, so the per-pass decision's
 * success variant and the public result are the same value.
 */
export class Satisfied extends Schema.TaggedClass<Satisfied>()('Satisfied', {}) {
  readonly [ProbeVerdictTypeId] = ProbeVerdictTypeId
}

/** One pass's judgement that the condition does not hold yet; the shell polls again. */
export class NotYet extends Schema.TaggedClass<NotYet>()('NotYet', {}) {
  readonly [ProbeVerdictTypeId] = ProbeVerdictTypeId
}

/** The decision `evaluateProbe` reaches in one pass. */
export const ProbeVerdict = Schema.Union([Satisfied, NotYet])
export type ProbeVerdict = typeof ProbeVerdict.Type
