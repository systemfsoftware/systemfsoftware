import * as Arr from 'effect/Array'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'

import { EvidenceRef } from './check.schema.js'

export const Cause = Schema.Literals(['product', 'automation', 'environment', 'unclassified'])
export type Cause = typeof Cause.Type

export const ProposedCause = Schema.Struct({ cause: Cause, evidence: Schema.Array(EvidenceRef) })
export type ProposedCause = typeof ProposedCause.Type

export const RecordedProposal = Schema.Struct({ proposed: Schema.optionalKey(ProposedCause) })
export type RecordedProposal = typeof RecordedProposal.Type

export const recordedProposalOf = (proposed: ProposedCause | undefined): RecordedProposal =>
  Option.match(Option.fromUndefinedOr(proposed), {
    onNone: (): RecordedProposal => ({}),
    onSome: (kept): RecordedProposal =>
      Arr.match(kept.evidence, {
        onEmpty: (): RecordedProposal => ({ proposed: { cause: 'unclassified', evidence: [] } }),
        onNonEmpty: (): RecordedProposal => ({ proposed: kept }),
      }),
  })
