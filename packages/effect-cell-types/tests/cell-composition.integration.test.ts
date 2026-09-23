import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
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

interface Bytes {
  readonly bytes: string
}

const mixedItems: readonly Command[] = [{ id: 'a' }, { id: 'bbbb' }, { id: 'cc' }]
const readFailingItems: readonly Command[] = [{ id: 'a' }, { id: 'bad' }, { id: 'cc' }]

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

const failureErrorOf = <A, E>(
  exit: Exit.Exit<A, E>,
): E | undefined => Exit.isFailure(exit) ? Option.getOrUndefined(exit.cause.pipe(Cause.findErrorOption)) : undefined

const readerCell = (admitted: Option.Option<Bytes>) =>
  Sandwich.named('cell.composition.reader')((command: Command) =>
    Effect.succeed(new Decoded({ length: command.id.length }))
  ).decide(
    admitDecodedCommand,
  ).write(() => Effect.succeed(admitted))

const readerThatFails = Sandwich.named('cell.composition.reader.fails')(
  (command: Command) => Effect.fail(new Malformed({ length: command.id.length })),
).decide(admitDecodedCommand).write(() => Effect.succeed(Option.none<Bytes>()))

const innerCell = Sandwich.named('cell.composition.inner')((bytes: Bytes) =>
  Effect.succeed(new Decoded({ length: bytes.bytes.length }))
).decide(
  admitDecodedCommand,
).write((outcome: Result.Result<Admitted | Rejected, Malformed>) => Effect.sync(() => render(outcome)))

const innerCellThatFails = Sandwich.named('cell.composition.inner.fails')((bytes: Bytes) =>
  Effect.fail(new Malformed({ length: bytes.bytes.length }))
)
  .decide(admitDecodedCommand).write((outcome: Result.Result<Admitted | Rejected, Malformed>) =>
    Effect.sync(() => render(outcome))
  )

const itemCell = Sandwich.named('cell.composition.item')((command: Command) => {
  const decoded = new Decoded({ length: command.id.length })
  if (command.id === 'bad') {
    return Effect.fail(new Malformed({ length: decoded.length }))
  }
  return Effect.succeed(decoded)
}).decide(admitDecodedCommand).write((outcome: Result.Result<Admitted | Rejected, Malformed>) =>
  Effect.sync(() => render(outcome))
)

const answeringCell = Sandwich.named('cell.composition.answering', { boundaries: [0.1, 1] })((command: Command) =>
  Effect.succeed(new Decoded({ length: command.id.length }))
)
  .decide(admitDecodedCommand).write((outcome: Result.Result<Admitted | Rejected, Malformed>) =>
    Effect.flatMap(Ledger, (ledger) => ledger.append(render(outcome)))
  )

const readingBackCell = Sandwich.named('cell.composition.reading.back')((line: string) =>
  Effect.succeed(new Decoded({ length: line.length }))
).decide(
  admitDecodedCommand,
).write((outcome: Result.Result<Admitted | Rejected, Malformed>, raw: Decoded) =>
  Effect.flatMap(Ledger, (ledger) => ledger.append(`second:${render(outcome)}:${raw.length}`))
)

const standaloneProvided = Cell.provide(
  Cell.map(answeringCell, (res) => `completed:${res}`),
  LedgerRecording,
)

Feature('Composing cell workflows through algebraic combinators')
  .withScenarioLayer(LedgerRecording)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'Sequential composition feeds the output of the first stage into the input of the second',
      Gherkin.Do.pipe(
        When('two processing stages are sequenced on an admitted command')(
          'lines',
          () =>
            Effect.map(Cell.andThen(answeringCell, readingBackCell).run({ id: 'abcd' }), (response) => ({ response })),
        ),
        Then('the final stage returns the compounded result')((s) => {
          expect(s.lines.response).toBe('second:admitted:10:10')
        }),
        And('both audit ledger writes landed in sequence')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['admitted:4', 'second:admitted:10:10'])
            }))
        ),
      ),
    )

    scenario(
      'Concurrent composition evaluates identical stages in parallel and pairs their outcomes',
      Gherkin.Do.pipe(
        When('a stage is paired with its duplicate')(
          'exit',
          () => Effect.exit(Cell.zip(answeringCell, answeringCell).run({ id: 'abcd' })),
        ),
        Then('both outcomes are delivered as a tuple')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed(['admitted:4', 'admitted:4'] as const))
        }),
      ),
    )

    scenarioOutline(
      'Pre-processing an incoming command payload adapts its structure for the processing pipeline',
      [
        { rawId: 'abcd', expectedResult: 'admitted:4' },
        { rawId: 'ab', expectedResult: 'refused:too short' },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('an incoming request from an external system')(
            'req',
            () => Effect.succeed({ envelope: { id: row.rawId } }),
          ),
          When('the request is adapted and processed through the pipeline')(
            'exit',
            ({ req }) => {
              const adapted = Cell.mapInput(answeringCell, (r: { readonly envelope: Command }) => r.envelope)
              return Effect.exit(adapted.run(req))
            },
          ),
          Then('the processing outcome matches the evaluated payload')(({ exit }) => {
            expect(exit).toStrictEqual(Exit.succeed(row.expectedResult))
          }),
          And('the decision was recorded in the ledger')(() =>
            Effect.flatMap(Ledger, (ledger) =>
              Effect.map(ledger.lines, (lines) => {
                expect(lines).toContain(row.expectedResult)
              }))
          ),
        ),
    )

    scenario(
      'A client provides its own environment to satisfy system requirements before dispatch',
      Gherkin.Do.pipe(
        Given('a command ready to submit to an auditing pipeline')(
          'cmd',
          () => Effect.succeed({ id: 'abcd' }),
        ),
        When('the pipeline is pre-configured with the audit ledger')(
          'exit',
          ({ cmd }) => Effect.exit(standaloneProvided.run(cmd)),
        ),
        Then('the command processes successfully to completion')(({ exit }) => {
          expect(exit).toStrictEqual(Exit.succeed('completed:admitted:4'))
        }),
      ),
    )

    scenarioOutline(
      'Conditional gating executes or skips the protected stage based on gate availability',
      [
        {
          admittedBytes: null,
          expectedResult: null,
        },
        {
          admittedBytes: 'abcd',
          expectedResult: 'admitted:4',
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          When('evaluating a gated stage')(
            'run',
            () => {
              let option = Option.none<Bytes>()
              if (row.admittedBytes !== null) {
                option = Option.some<Bytes>({ bytes: row.admittedBytes })
              }
              const gated = Cell.gate(readerCell(option), innerCell)
              return Effect.map(gated.run({ id: 'abcd' }), (response) => ({ response }))
            },
          ),
          Then('the gated execution yields the expected optional result')((s) => {
            let expected: Option.Option<string | Bytes> = Option.none()
            if (row.expectedResult !== null) {
              expected = Option.some(row.expectedResult)
            }
            expect(s.run.response).toStrictEqual(expected)
          }),
        ),
    )

    scenarioOutline(
      'Failures in gated pipelines propagate immediately from whichever stage faulted',
      [
        {
          failingStage: 'gate',
          expectedLength: 4,
        },
        {
          failingStage: 'protected',
          expectedLength: 4,
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          When('a gated pipeline encounters an upstream or downstream fault')(
            'run',
            () => {
              let cell = Cell.gate(readerCell(Option.some({ bytes: 'abcd' })), innerCellThatFails)
              if (row.failingStage === 'gate') {
                cell = Cell.gate(readerThatFails, innerCell)
              }
              return Effect.map(Effect.exit(cell.run({ id: 'abcd' })), (exit) => ({ exit }))
            },
          ),
          Then('the entire pipeline terminates with the specific validation error')((s) => {
            expect(failureErrorOf(s.run.exit)).toStrictEqual(new Malformed({ length: row.expectedLength }))
          }),
        ),
    )

    scenario(
      'Batch collection folds stream outcomes across items sequentially',
      Gherkin.Do.pipe(
        When('evaluating batch items through a fail-fast collection')(
          'run',
          () => {
            const collected = Cell.collect(itemCell, (responses: readonly string[]) => responses.join('|'))
            return Effect.map(collected.run(mixedItems), (response) => ({ response }))
          },
        ),
        Then('the aggregation produces the complete folded result')((s) => {
          expect(s.run.response).toBe('refused:too short|admitted:4|refused:too short')
        }),
      ),
    )

    scenario(
      'Batch collection gathers all failures across items without short-circuiting',
      Gherkin.Do.pipe(
        When('evaluating batch items through an outcome-gathering collection')(
          'run',
          () => {
            const gathered = Cell.collectAll(
              itemCell,
              (results: readonly Result.Result<string, Malformed>[]) =>
                results.map((result) =>
                  Result.match(result, {
                    onSuccess: (response) => `ok:${response}`,
                    onFailure: (malformed) => `fail:${malformed._tag}`,
                  })
                ),
            )
            return Effect.map(gathered.run(readFailingItems), (response) => ({ response }))
          },
        ),
        Then('the aggregation produces every outcome including each failure')((s) => {
          expect(s.run.response).toStrictEqual(['ok:refused:too short', 'fail:Malformed', 'ok:refused:too short'])
        }),
      ),
    )

    scenario(
      'Fail-fast batch collection aborts upon the first encountered error',
      Gherkin.Do.pipe(
        When('an item in a fail-fast collection raises an error')(
          'run',
          () => {
            const collected = Cell.collect(itemCell, (responses: readonly string[]) => responses.join('|'))
            return Effect.map(Effect.exit(collected.run(readFailingItems)), (exit) => ({ exit }))
          },
        ),
        Then('the entire batch collection fails with that error')((s) => {
          expect(failureErrorOf(s.run.exit)).toStrictEqual(new Malformed({ length: 3 }))
        }),
      ),
    )

    scenario(
      'Processing an empty batch produces zero outcomes across both collection strategies',
      Gherkin.Do.pipe(
        When('running collection over an empty list')(
          'run',
          () => {
            const collected = Cell.collect(itemCell, (responses: readonly string[]) => responses.length)
            const gathered = Cell.collectAll(
              itemCell,
              (results: readonly Result.Result<string, Malformed>[]) => results.length,
            )
            return Effect.zipWith(
              collected.run([]),
              gathered.run([]),
              (failFast, accumulate) => ({ failFast, accumulate }),
            )
          },
        ),
        Then('both collection modes complete with zero entries')((s) => {
          expect(s.run.failFast).toBe(0)
          expect(s.run.accumulate).toBe(0)
        }),
      ),
    )
  })
