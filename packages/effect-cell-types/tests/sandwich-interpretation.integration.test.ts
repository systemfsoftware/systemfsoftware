import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import {
  admitDecodedCommand,
  Admitted,
  Decoded,
  Malformed,
  Rejected,
} from './__fixtures__/admit-decoded-command.workflow.js'

const Feature = makeFeature({ it, layer })

interface Command {
  readonly id: string
}

interface Raw {
  readonly bytes: string
}

interface Output {
  readonly line: string
}

/**
 * The write observer: every line a Cell writes lands here. A test-owned port in a local
 * closure — never a service on the product's `R` (CELL-T4).
 */
class Ledger extends Context.Service<Ledger, {
  readonly lines: Effect.Effect<ReadonlyArray<string>>
  readonly append: (line: string) => Effect.Effect<string>
}>()('Ledger') {}

const LedgerRecording = Layer.sync(Ledger, () => {
  const lines: string[] = []
  return {
    lines: Effect.sync(() => lines),
    append: (line: string) =>
      Effect.sync(() => {
        lines.push(line)
        return line
      }),
  }
})

const render = (outcome: Result.Result<Admitted | Rejected, Malformed>): string =>
  Result.match(outcome, {
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('Admitted', (admitted) => `admitted:${admitted.length}`),
        Match.tag('Rejected', (rejected) => `refused:${rejected.why}`),
        Match.exhaustive,
      ),
    onFailure: (malformed) => `malformed:${malformed.length}`,
  })

const admitCell: Cell.Cell<Command, string, never, Ledger> = Sandwich.read((command: Command) =>
  Effect.succeed(new Decoded({ length: command.id.length }))
).decide(admitDecodedCommand).write((outcome: Result.Result<Admitted | Rejected, Malformed>) =>
  Effect.flatMap(Ledger, (ledger) => ledger.append(render(outcome)))
)

/** A reading the validation refuses, and a reading the decider refuses. */
const decodeRaw = (raw: Raw): Result.Result<Decoded, Malformed> =>
  Match.value(raw.bytes).pipe(
    Match.when('bad', () => Result.fail(new Malformed({ length: raw.bytes.length }))),
    Match.when('decide-bad', () => Result.succeed(new Decoded({ length: -1 }))),
    Match.orElse(() => Result.succeed(new Decoded({ length: raw.bytes.length }))),
  )

const reportingCell: Cell.Cell<Command, string, Malformed, Ledger> = Sandwich.read((command: Command) =>
  Effect.succeed({ bytes: command.id })
).decode(
  Sandwich.pure(decodeRaw),
).decide(admitDecodedCommand).encode(
  Sandwich.pure((outcome) => Result.succeed({ line: render(outcome) })),
).write((output: Output, raw: Raw) => Effect.flatMap(Ledger, (ledger) => ledger.append(`${output.line}<-${raw.bytes}`)))

Feature('Interpreting a cell sandwich')
  .withScenarioLayer(LedgerRecording)
  .body(({ scenario, scenarioOutline }) => {
    scenarioOutline(
      'A decision is written as the outcome, never raised as a failure',
      [
        { id: 'abc', outcome: 'refused:too short' },
        { id: 'abcd', outcome: 'admitted:4' },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          When('a Cell is run for a command its decision rules on')(
            'exit',
            () => Effect.exit(admitCell.run({ id: row.id })),
          ),
          Then('the run succeeds and its response carries the decision')((s) => {
            expect(s.exit).toStrictEqual(Exit.succeed(row.outcome))
          }),
          And('the decision reached the write')(() =>
            Effect.flatMap(Ledger, (ledger) =>
              Effect.map(ledger.lines, (lines) => {
                expect(lines).toEqual([row.outcome])
              }))
          ),
        ),
    )

    scenario(
      'A write receives the raw the read gathered',
      Gherkin.Do.pipe(
        When('a Cell whose write reports its raw is run')(
          'exit',
          () => Effect.exit(reportingCell.run({ id: 'abcd' })),
        ),
        Then('the run succeeds with the response the write returned')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('admitted:4<-abcd'))
        }),
        And('the write recorded the encoded output together with the raw')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['admitted:4<-abcd'])
            }))
        ),
      ),
    )

    scenario(
      'A malformed reading fails the run before anything is written',
      Gherkin.Do.pipe(
        When('a Cell is run for a command its validation rejects')(
          'exit',
          () => Effect.exit(reportingCell.run({ id: 'bad' })),
        ),
        Then('the run fails with the malformed report')((s) => {
          expect(s.exit).toStrictEqual(Exit.fail(new Malformed({ length: 3 })))
        }),
        And('nothing was written')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual([])
            }))
        ),
      ),
    )

    scenario(
      'A decider failure is encoded as the outcome rather than raised as a failure',
      Gherkin.Do.pipe(
        When('a Cell is run for a command its decider cannot decide')(
          'exit',
          () => Effect.exit(reportingCell.run({ id: 'decide-bad' })),
        ),
        Then('the run succeeds and its response carries the decider failure')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('malformed:-1<-decide-bad'))
        }),
        And('the encoded failure reached the write')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['malformed:-1<-decide-bad'])
            }))
        ),
      ),
    )
  })
