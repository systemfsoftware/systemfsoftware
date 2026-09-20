import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
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

class Ledger extends Context.Service<Ledger, {
  readonly lines: Effect.Effect<ReadonlyArray<string>>
  readonly append: (line: string) => Effect.Effect<string>
}>()('Ledger') {}

const LedgerRecording = Layer.sync(Ledger, () => {
  const lines: string[] = []
  return {
    lines: Effect.succeed(lines),
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

const decodeRaw = (raw: Raw): Result.Result<Decoded, Malformed> =>
  Match.value(raw.bytes).pipe(
    Match.when('bad', () => Result.fail(new Malformed({ length: raw.bytes.length }))),
    Match.when('decide-bad', () => Result.succeed(new Decoded({ length: -1 }))),
    Match.orElse(() => Result.succeed(new Decoded({ length: raw.bytes.length }))),
  )

const pipelineCell = Sandwich.read((command: Command) => Effect.succeed({ bytes: command.id })).decode(
  Sandwich.pure(decodeRaw),
).decide(admitDecodedCommand).encode(
  Sandwich.pure((outcome) => Result.succeed({ line: render(outcome) })),
).write((output: Output, raw: Raw) => Effect.flatMap(Ledger, (ledger) => ledger.append(`${output.line}<-${raw.bytes}`)))

Feature('Executing commands through an admission pipeline')
  .withScenarioLayer(LedgerRecording)
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'Decisions and handled refusals are committed to the audit ledger',
      [
        {
          commandId: 'abcd',
          expectedExit: Exit.succeed('admitted:4<-abcd'),
          expectedLedger: ['admitted:4<-abcd'],
        },
        {
          commandId: 'abc',
          expectedExit: Exit.succeed('refused:too short<-abc'),
          expectedLedger: ['refused:too short<-abc'],
        },
        {
          commandId: 'decide-bad',
          expectedExit: Exit.succeed('malformed:-1<-decide-bad'),
          expectedLedger: ['malformed:-1<-decide-bad'],
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a command ready for admission processing')(
            'cmd',
            () => Effect.succeed({ id: row.commandId }),
          ),
          When('the pipeline processes the command')(
            'exit',
            ({ cmd }) => Effect.exit(pipelineCell.run(cmd)),
          ),
          Then('the process finishes with the expected outcome')(({ exit }) => {
            expect(exit).toStrictEqual(row.expectedExit)
          }),
          And('the audit log recorded the exact result')(() =>
            Effect.flatMap(Ledger, (ledger) =>
              Effect.map(ledger.lines, (lines) => {
                expect(lines).toEqual(row.expectedLedger)
              }))
          ),
        ),
    )

    scenarioOutline(
      'Malformed input terminates processing before any write to the ledger',
      [
        { commandId: 'bad', expectedLength: 3 },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('an unparseable command payload')(
            'cmd',
            () => Effect.succeed({ id: row.commandId }),
          ),
          When('the pipeline attempts to validate the command')(
            'exit',
            ({ cmd }) => Effect.exit(pipelineCell.run(cmd)),
          ),
          Then('the run terminates with a validation error')(({ exit }) => {
            expect(exit).toStrictEqual(Exit.fail(new Malformed({ length: row.expectedLength })))
          }),
          And('nothing was committed to the ledger')(() =>
            Effect.flatMap(Ledger, (ledger) =>
              Effect.map(ledger.lines, (lines) => {
                expect(lines).toEqual([])
              }))
          ),
        ),
    )
  })
