import { Cell } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Result from 'effect/Result'
import { expect } from 'vitest'
import {
  admitDecodedCommand as decideFixture,
  Admitted,
  Decoded,
  Refused,
} from './__fixtures__/admit-decoded-command.workflow.js'
import { admitTracedCommand as admitTracedCommandFixture } from './__fixtures__/admit-traced-command.workflow.js'

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
interface Malformed {
  readonly kind: 'Malformed'
  readonly bytes: string
}

class Ledger extends Context.Service<Ledger, {
  readonly append: (line: string) => Effect.Effect<void>
  readonly lines: Effect.Effect<readonly string[]>
}>()('Ledger') {}

type LedgerService = Ledger['Service']

const LedgerRecording = Layer.sync(Ledger, () => {
  const written: string[] = []
  return {
    append: (line: string) =>
      Effect.sync(() => {
        written.push(line)
      }),
    lines: Effect.sync(() => written),
  }
})

const read = (command: Command) => Effect.succeed({ bytes: command.id })

const decode = (raw: Raw): Result.Result<Decoded, Malformed> =>
  raw.bytes === 'bad'
    ? Result.fail({ kind: 'Malformed', bytes: raw.bytes })
    : Result.succeed(new Decoded({ length: raw.bytes.length }))

const encode = (outcome: Result.Result<Admitted, Refused>): Output =>
  Result.match(outcome, {
    onSuccess: (admitted) => ({ line: `admitted:${admitted.length}` }),
    onFailure: (refused) => ({ line: `refused:${refused.why}` }),
  })

const makeCell = (ledger: LedgerService) =>
  Cell.layer({
    read,
    decode,
    decide: decideFixture,
    encode,
    write: (output: Output) => ledger.append(output.line).pipe(Effect.as(output.line)),
  })

const makeCellReportingItsRaw = (ledger: LedgerService) =>
  Cell.layer({
    read,
    decode,
    decide: decideFixture,
    encode,
    write: (output: Output, raw: Raw) => ledger.append(`${output.line}<-${raw.bytes}`).pipe(Effect.as(output.line)),
  })

// The order oracle is hand-written here, one scenario over a local trace. It is the
// only order test: the interpreter is text, and this is where a reader checks it.

Feature('Running a Cell')
  .withScenarioLayer(LedgerRecording)
  .body(({ scenario }) => {
    scenario(
      'A refused decision is written as the outcome rather than raised as a failure',
      Gherkin.Do.pipe(
        When('a Cell is run for a command its decision refuses')(
          'exit',
          () => Effect.flatMap(Ledger, (ledger) => Effect.exit(Cell.run(makeCell(ledger), { id: 'abc' }))),
        ),
        Then('the run succeeds and its response carries the refusal')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('refused:too short'))
        }),
        And('the refusal reached the write')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['refused:too short'])
            }))
        ),
      ),
    )

    scenario(
      'An admitted decision is written as the outcome',
      Gherkin.Do.pipe(
        When('a Cell is run for a command its decision admits')(
          'exit',
          () => Effect.flatMap(Ledger, (ledger) => Effect.exit(Cell.run(makeCell(ledger), { id: 'abcd' }))),
        ),
        Then('the run succeeds and its response carries the decision')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('admitted:4'))
        }),
      ),
    )

    scenario(
      'A write receives the raw the read gathered',
      Gherkin.Do.pipe(
        When('a Cell whose write reports its raw is run')(
          'exit',
          () =>
            Effect.flatMap(
              Ledger,
              (ledger) => Effect.exit(Cell.run(makeCellReportingItsRaw(ledger), { id: 'abcd' })),
            ),
        ),
        Then('the run succeeds with the response the write returned')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed('admitted:4'))
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
          () => Effect.flatMap(Ledger, (ledger) => Effect.exit(Cell.run(makeCell(ledger), { id: 'bad' }))),
        ),
        Then('the run fails with the malformed report')((s) => {
          expect(s.exit).toStrictEqual(Exit.fail({ kind: 'Malformed', bytes: 'bad' }))
        }),
        And('nothing was written')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual([])
            }))
        ),
      ),
    )

    const makeTracedCell = (trace: string[]) =>
      Cell.layer({
        read: (command: Command) =>
          Effect.sync(() => {
            trace.push('read')
            return { bytes: command.id }
          }),
        decode: (raw: Raw) => {
          trace.push('decode')
          return Result.succeed(new Decoded({ length: raw.bytes.length }))
        },
        decide: admitTracedCommandFixture(trace, new Admitted({ length: 0 }), new Refused({ why: 'too long' })),
        encode: (outcome: Result.Result<Admitted, Refused>) => {
          trace.push('encode')
          return Result.match(outcome, {
            onSuccess: (admitted) => ({ line: `admitted:${admitted.length}` }),
            onFailure: (refused) => ({ line: `refused:${refused.why}` }),
          })
        },
        write: (output: Output) =>
          Effect.sync(() => {
            trace.push('write')
            return output.line
          }),
      })
    const runTraced = (id: string) => {
      const trace: string[] = []
      return Cell.run(makeTracedCell(trace), { id }).pipe(
        Effect.exit,
        Effect.map((exit) => ({ exit, trace })),
      )
    }
    scenario(
      'The interpreter runs the sandwich in its declared order',
      Gherkin.Do.pipe(
        When('a Cell with tracing phases is run')('outcome', () => runTraced('abc')),
        Then('the phases ran exactly in the order the interpreter reads them')((s) => {
          expect(s.outcome.trace).toEqual(['read', 'decode', 'decide', 'encode', 'write'])
          expect(s.outcome.exit).toStrictEqual(Exit.succeed('admitted:0'))
        }),
      ),
    )
    scenario(
      'A refusal the decision returns is encoded, not thrown',
      Gherkin.Do.pipe(
        When('a Cell with tracing phases is run for an over-long command')('outcome', () => runTraced('a'.repeat(101))),
        Then('the refusal travelled the failure channel into the write')((s) => {
          expect(s.outcome.exit).toStrictEqual(Exit.succeed('refused:too long'))
        }),
      ),
    )
    scenario(
      'andThen feeds the first Cell response to the second Cell read',
      Gherkin.Do.pipe(
        When('two Cells are chained and run for an admitted command')(
          'lines',
          () =>
            Effect.flatMap(Ledger, (ledger) => {
              const first = makeCell(ledger)
              const second = Cell.layer({
                read: (line: string) => Effect.succeed(new Decoded({ length: line.length })),
                decide: decideFixture,
                write: (outcome: Result.Result<Admitted, Refused>, raw: Decoded) => {
                  const line = Result.match(outcome, {
                    onSuccess: (admitted) => `second:admitted:${admitted.length}:${raw.length}`,
                    onFailure: (refused) => `second:refused:${refused.why}`,
                  })
                  return ledger.append(line).pipe(Effect.as(line))
                },
              })
              const chained = Cell.andThen(first, second)
              return Effect.map(Cell.run(chained, { id: 'abcd' }), (response) => ({ response }))
            }),
        ),
        Then('the run answers with the second Cell response')((s) => {
          expect(s.lines.response).toBe('second:admitted:10:10')
        }),
        And('both writes landed in order')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['admitted:4', 'second:admitted:10:10'])
            }))
        ),
      ),
    )

    scenario(
      'zip runs both Cells against the same input and tuples the responses',
      Gherkin.Do.pipe(
        When('a Cell is zipped with a twin and run')(
          'exit',
          () =>
            Effect.flatMap(Ledger, (ledger) => {
              const zipped = Cell.zip(makeCell(ledger), makeCell(ledger))
              return Effect.exit(Cell.run(zipped, { id: 'abcd' }))
            }),
        ),
        Then('both responses arrive as a tuple')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed(['admitted:4', 'admitted:4'] as const))
        }),
      ),
    )
  })
