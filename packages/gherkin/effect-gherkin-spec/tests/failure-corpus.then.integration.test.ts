import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import type { FailureRecord } from '@systemfsoftware/vitest/failure'
import { recordOfRun } from '@systemfsoftware/vitest/failure'
import { Effect, Layer, Option } from 'effect'
import { FIRST_LOCATION } from './__fixtures__/failure-corpus/record.js'
import { thenAssertionFixture } from './__fixtures__/failure-corpus/then-assertion.js'

const Feature = makeFeature({ it })

interface ThenVerdict {
  readonly name: string
  readonly namesDefectFile: boolean
  readonly firstLocation: string | undefined
  readonly firstLocationFile: string | undefined
  readonly hasRerun: boolean
  readonly failingStep: string | undefined
}

const fileOf = (location: string | undefined): string | undefined => location?.replace(/:\d+$/u, '')

const verdictOf = (record: FailureRecord): ThenVerdict => {
  const first = FIRST_LOCATION.exec(record.record)?.[0]
  return {
    name: record.name,
    namesDefectFile: record.record.includes(thenAssertionFixture.defectFile),
    firstLocation: first,
    firstLocationFile: fileOf(first),
    hasRerun: record.record.includes('Rerun only this scenario:'),
    failingStep: record.record.split('\n').find((line) => line.startsWith('Failing step: ')),
  }
}

Feature('A gherkin Then assertion that mismatches prints a record')
  .withLayer(Layer.empty)
  .live('the corpus runs the runner in process, which is not the scenario that owns the running check ledger')
  .body(({ scenario }) => {
    scenario(
      'A Then step whose assertion mismatches yields a record naming the spec line that wrote it',
      Gherkin.Do.pipe(
        Given('a Then spec whose assertion mismatches')('verdict', () =>
          Effect.map(
            Effect.promise(() => recordOfRun(thenAssertionFixture.program)),
            (record) => Option.getOrNull(Option.map(Option.fromNullishOr(record), verdictOf)),
          )),
        Then('the record names the Then spec line first')((s, expect) =>
          expect(s.verdict).toMatchObject({
            name: 'StepError',
            namesDefectFile: true,
            firstLocationFile: thenAssertionFixture.raisingFile,
            hasRerun: true,
            failingStep: expect.stringContaining('Failing step: Then the ledger matches what the step expected'),
          })
        ),
      ),
    )
  })
