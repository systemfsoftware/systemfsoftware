import { Match, Schema } from 'effect'
import { RejectionStatus } from './InstallVerdict.schema.js'

const GateOutcomeTypeId: unique symbol = Symbol.for('@systemfsoftware/registry-gate/GateOutcome')
type GateOutcomeTypeId = typeof GateOutcomeTypeId

export class GithubPackages extends Schema.TaggedClass<GithubPackages>()('GithubPackages', {
  installed: Schema.String,
}) {
  readonly [GateOutcomeTypeId] = GateOutcomeTypeId
}

export class OwnRegistry extends Schema.TaggedClass<OwnRegistry>()('OwnRegistry', {
  status: RejectionStatus,
}) {
  readonly [GateOutcomeTypeId] = GateOutcomeTypeId
}

export class Inconclusive extends Schema.TaggedClass<Inconclusive>()('Inconclusive', {
  reason: Schema.String,
}) {
  readonly [GateOutcomeTypeId] = GateOutcomeTypeId
}

export const GateOutcome = Schema.Union([GithubPackages, OwnRegistry, Inconclusive])
export type GateOutcome = typeof GateOutcome.Type

export const OutcomeId = Schema.Literals(['github-packages', 'own-registry', 'inconclusive'])
export type OutcomeId = typeof OutcomeId.Type

export const outcomeIdOf = (outcome: GateOutcome): OutcomeId =>
  Match.value(outcome).pipe(
    Match.tag('GithubPackages', (): OutcomeId => 'github-packages'),
    Match.tag('OwnRegistry', (): OutcomeId => 'own-registry'),
    Match.tag('Inconclusive', (): OutcomeId => 'inconclusive'),
    Match.exhaustive,
  )
