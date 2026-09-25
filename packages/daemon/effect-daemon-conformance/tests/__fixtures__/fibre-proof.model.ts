import { Schema } from 'effect'

export const Verdict = Schema.Struct({
  scenario: Schema.String,
  outcome: Schema.Literals(['conform', 'diverge', 'stalled']),
})
export type Verdict = typeof Verdict.Type

export const ProveFibreReference = Schema.TaggedStruct('ProveFibreReference', {})
export type ProveFibreReference = typeof ProveFibreReference.Type

export const ProofState = Schema.Struct({ proofs: Schema.Int })
export type ProofState = typeof ProofState.Type

const NO_PROOFS_YET: ProofState = { proofs: 0 }

export const EXPECTED_CATALOGUE_VERDICTS: ReadonlyArray<Verdict> = [
  { scenario: 'ready-then-exit-normal', outcome: 'conform' },
  { scenario: 'ready-then-exit-abnormal', outcome: 'conform' },
  { scenario: 'never-become-ready', outcome: 'conform' },
  { scenario: 'ignores-graceful-stop', outcome: 'conform' },
  { scenario: 'one-for-all-group-stop', outcome: 'conform' },
]

export const fibreProofModel = {
  state: ProofState,
  initial: NO_PROOFS_YET,
  precondition: (_state: ProofState, _command: ProveFibreReference): boolean => true,
  step: (
    state: ProofState,
    _command: ProveFibreReference,
  ): readonly [ProofState, ReadonlyArray<Verdict>] => [
    { proofs: state.proofs + 1 },
    EXPECTED_CATALOGUE_VERDICTS,
  ],
}
