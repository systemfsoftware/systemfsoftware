import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Schema } from 'effect'
import * as Result from 'effect/Result'

export class Connected extends Schema.TaggedClass<Connected>()('Connected', {}) {}
export class Absent extends Schema.TaggedClass<Absent>()('Absent', {}) {}
export const Evidence = Schema.Union([Connected, Absent])
export type Evidence = typeof Evidence.Type

export class EvaluateProbe extends Schema.TaggedClass<EvaluateProbe>()('EvaluateProbe', {
  evidence: Evidence,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const VerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-cell-types/tests/failure-corpus/ProbeVerdict')
type VerdictTypeId = typeof VerdictTypeId

export class Satisfied extends Schema.TaggedClass<Satisfied>()('Satisfied', {}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export class NotYet extends Schema.TaggedClass<NotYet>()('NotYet', {}) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export const Verdict = Schema.Union([Satisfied, NotYet])
export type Verdict = typeof Verdict.Type

export const evaluateProbe = Workflow.make({
  command: EvaluateProbe,
  decision: Verdict,
  error: Schema.Never,
  decide: (): Result.Result<Verdict, never> => Result.succeed(new NotYet({})),
})
