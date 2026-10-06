import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Contract } from '@systemfsoftware/effect-contract'
import { Match, Schema } from 'effect'
import * as Result from 'effect/Result'

const VerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/agent-front-door/EgressVerdict')

export class Allow extends Schema.TaggedClass<Allow>()('Allow', { host: Contract.Host }) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export class Deny extends Schema.TaggedClass<Deny>()('Deny', { host: Contract.Host }) {
  readonly [VerdictTypeId] = VerdictTypeId
}

export const AdmitVerdict = Schema.Union([Allow, Deny])
export type AdmitVerdict = typeof AdmitVerdict.Type

export class AdmitHost extends Schema.TaggedClass<AdmitHost>()('AdmitHost', {
  allow: Schema.Array(Contract.Host),
  host: Contract.Host,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const decideAdmission = (command: AdmitHost): Result.Result<Allow | Deny, never> =>
  Match.value(command.allow.includes(command.host)).pipe(
    Match.when(true, () => Result.succeed(new Allow({ host: command.host }))),
    Match.when(false, () => Result.succeed(new Deny({ host: command.host }))),
    Match.exhaustive,
  )

/** A host is admitted exactly when the allow-list names it; a suffix such as `evil.allowed.test` is not `allowed.test`. */
export const admitHost = Workflow.make({
  command: AdmitHost,
  decision: AdmitVerdict,
  error: Schema.Never,
  decide: decideAdmission,
})
