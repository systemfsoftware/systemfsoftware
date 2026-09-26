import type { StepError } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, StepExpect, Then } from '@systemfsoftware/effect-gherkin-spec'
import type { Asserted, Checks } from '@systemfsoftware/vitest'
import type { RecordedRun } from '@systemfsoftware/vitest/failure'
import { Effect } from 'effect'
import { Ledger, ledgerLayer } from './ledger.js'

export const defectFile = 'packages/gherkin/effect-gherkin-spec/tests/__fixtures__/failure-corpus/then-assertion.ts'

const spec = Gherkin.Do.pipe(
  Given('a ledger the Then step reads')('ledger', () => Ledger),
  Then('the ledger matches what the step expected')(
    (s, expect) => expect(s.ledger).toEqual('the ledger that never arrived'),
  ),
)

export interface ThenAssertionFixture {
  readonly name: string
  readonly defectFile: string
  readonly raisingFile: string
  readonly program: RecordedRun<object, StepError>
}

/** The program a corpus drives: the spec with its ledger provided, and the fresh ledger's `expect` on `StepExpect`. */
const program = (checks: Checks): Effect.Effect<object, StepError, Asserted> =>
  spec.pipe(
    Effect.provide(ledgerLayer),
    Effect.provideService(StepExpect, checks.expect),
  )

export const thenAssertionFixture: ThenAssertionFixture = {
  name: 'a Then step whose assertion mismatches',
  defectFile,
  raisingFile: defectFile,
  program,
}
