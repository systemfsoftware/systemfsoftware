import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { DirectoryPath, FileName, MutantId, MutatorName } from '@systemfsoftware/stryker-js/Mutant'
import { Effect } from 'effect'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import { expect } from 'vitest'

const checkExpect = expect
import { TestId } from '@systemfsoftware/stryker-js/TestRunner'

const Feature = makeFeature({ it, layer })

const brands = [
  { kind: 'mutant', schema: MutantId, sample: '0' },
  { kind: 'file', schema: FileName, sample: 'src/order.ts' },
  { kind: 'directory', schema: DirectoryPath, sample: 'reports' },
  { kind: 'mutator', schema: MutatorName, sample: 'Arithmetic' },
  { kind: 'test', schema: TestId, sample: 'src/order.ts#cancels the order' },
] as const

Feature('Payload decoding refuses identifiers that carry no content')
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'An empty <kind> identifier is refused',
      brands.map((entry) => ({ kind: entry.kind })),
      (row) => {
        const entry = brands.find((candidate) => candidate.kind === row.kind) ?? brands[0]
        return Gherkin.Do.pipe(
          Given(`a payload the run admits for a ${row.kind}`)(
            'contract',
            () => Effect.succeed(`${entry.kind} contract in force`),
          ),
          When('the empty identifier is decoded against it')(
            'accepted',
            () => Effect.succeed(Result.isSuccess(Schema.decodeUnknownResult(entry.schema)(''))),
          ),
          Then('the payload is refused')((s) => {
            checkExpect(s.accepted).toBe(false)
          }),
        )
      },
    )

    scenarioOutline(
      'A filled <kind> identifier is accepted',
      brands.map((entry) => ({ kind: entry.kind })),
      (row) => {
        const entry = brands.find((candidate) => candidate.kind === row.kind) ?? brands[0]
        return Gherkin.Do.pipe(
          Given(`a payload the run admits for a ${row.kind}`)(
            'contract',
            () => Effect.succeed(`${entry.kind} contract in force`),
          ),
          When('an identifier with content is decoded against it')(
            'accepted',
            () => Effect.succeed(Result.isSuccess(Schema.decodeUnknownResult(entry.schema)(entry.sample))),
          ),
          Then('the payload is admitted')((s) => {
            checkExpect(s.accepted).toBe(true)
          }),
        )
      },
    )
  })
