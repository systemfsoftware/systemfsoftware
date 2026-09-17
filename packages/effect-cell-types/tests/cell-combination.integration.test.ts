import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
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

const readerCell = (
  admitted: Option.Option<Bytes>,
): Cell.Cell<Command, Option.Option<Bytes>, never, never> =>
  Sandwich.read((command: Command) => Effect.succeed(new Decoded({ length: command.id.length }))).decide(
    admitDecodedCommand,
  ).write(() => Effect.succeed(admitted))

const readerThatFails: Cell.Cell<Command, Option.Option<Bytes>, Malformed, never> = Sandwich.read(
  (command: Command) => Effect.fail(new Malformed({ length: command.id.length })),
).decide(admitDecodedCommand).write(() => Effect.succeed(Option.none<Bytes>()))

const innerCell: Cell.Cell<Bytes, string, Malformed, never> = Sandwich.read((bytes: Bytes) =>
  Effect.succeed(new Decoded({ length: bytes.bytes.length }))
).decide(admitDecodedCommand).write((outcome: Result.Result<Admitted | Rejected, Malformed>) =>
  Effect.sync(() => render(outcome))
)

const innerCellThatFails: Cell.Cell<Bytes, string, Malformed, never> = Sandwich.read((bytes: Bytes) =>
  Effect.fail(new Malformed({ length: bytes.bytes.length }))
).decide(admitDecodedCommand).write((outcome: Result.Result<Admitted | Rejected, Malformed>) =>
  Effect.sync(() => render(outcome))
)

const itemCell: Cell.Cell<Command, string, Malformed, never> = Sandwich.read((command: Command) => {
  const decoded = new Decoded({ length: command.id.length })
  return command.id === 'bad' ? Effect.fail(new Malformed({ length: decoded.length })) : Effect.succeed(decoded)
}).decide(admitDecodedCommand).write((outcome: Result.Result<Admitted | Rejected, Malformed>) =>
  Effect.sync(() => render(outcome))
)

const answeringCell: Cell.Cell<Command, string, never, Ledger> = Sandwich.read((command: Command) =>
  Effect.succeed(new Decoded({ length: command.id.length }))
).decide(admitDecodedCommand).write((outcome: Result.Result<Admitted | Rejected, Malformed>) =>
  Effect.flatMap(Ledger, (ledger) => ledger.append(render(outcome)))
)

const readingBackCell: Cell.Cell<string, string, never, Ledger> = Sandwich.read((line: string) =>
  Effect.succeed(new Decoded({ length: line.length }))
).decide(admitDecodedCommand).write((outcome: Result.Result<Admitted | Rejected, Malformed>, raw: Decoded) =>
  Effect.flatMap(Ledger, (ledger) => ledger.append(`second:${render(outcome)}:${raw.length}`))
)

Feature('Combining cells')
  .withScenarioLayer(LedgerRecording)
  .body(({ scenario }) => {
    scenario(
      'A chained Cell reads what the first Cell answered',
      Gherkin.Do.pipe(
        When('two Cells are chained and run for an admitted command')(
          'lines',
          () =>
            Effect.map(Cell.andThen(answeringCell, readingBackCell).run({ id: 'abcd' }), (response) => ({ response })),
        ),
        Then('the run answers with the second Cell answer')((s) => {
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
      'Two Cells zipped on one command answer together',
      Gherkin.Do.pipe(
        When('a Cell is zipped with a twin and run')(
          'exit',
          () => Effect.exit(Cell.zip(answeringCell, answeringCell).run({ id: 'abcd' })),
        ),
        Then('both answers arrive as a pair')((s) => {
          expect(s.exit).toStrictEqual(Exit.succeed(['admitted:4', 'admitted:4'] as const))
        }),
      ),
    )

    scenario(
      'A reader that admits nothing runs no inner Cell',
      Gherkin.Do.pipe(
        When('a Cell that gates an inner Cell on its reader is run for nothing')('run', () => {
          const gated = Cell.gate(readerCell(Option.none()), innerCell)
          return Effect.map(gated.run({ id: 'abcd' }), (response) => ({ response }))
        }),
        Then('the answer is empty')((s) => {
          expect(s.run.response).toStrictEqual(Option.none<Bytes>())
        }),
      ),
    )

    scenario(
      'A reader that admits something runs the inner Cell on it',
      Gherkin.Do.pipe(
        When('a Cell that gates an inner Cell on its reader is run for something')('run', () => {
          const gated = Cell.gate(readerCell(Option.some({ bytes: 'abcd' })), innerCell)
          return Effect.map(gated.run({ id: 'abcd' }), (response) => ({ response }))
        }),
        Then('the answer carries the inner Cell answer')((s) => {
          expect(s.run.response).toStrictEqual(Option.some('admitted:4'))
        }),
      ),
    )

    scenario(
      'A reader that fails fails the whole run',
      Gherkin.Do.pipe(
        When('a Cell that gates an inner Cell on a failing reader is run')('run', () => {
          const gated = Cell.gate(readerThatFails, innerCell)
          return Effect.map(Effect.exit(gated.run({ id: 'abcd' })), (exit) => ({ exit }))
        }),
        Then('the run fails with the reader failure')((s) => {
          expect(s.run.exit).toStrictEqual(Exit.fail(new Malformed({ length: 4 })))
        }),
      ),
    )

    scenario(
      'An inner Cell that fails fails the whole run after its read',
      Gherkin.Do.pipe(
        When('a Cell that gates a failing inner Cell on its reader is run')('run', () => {
          const gated = Cell.gate(readerCell(Option.some({ bytes: 'abcd' })), innerCellThatFails)
          return Effect.map(Effect.exit(gated.run({ id: 'abcd' })), (exit) => ({ exit }))
        }),
        Then('the run fails with the inner failure')((s) => {
          expect(s.run.exit).toStrictEqual(Exit.fail(new Malformed({ length: 4 })))
        }),
      ),
    )
    scenario(
      'A per-item Cell folds every answer in order',
      Gherkin.Do.pipe(
        When('a Cell that runs once per item is run over three items')('run', () => {
          const collected = Cell.collect(itemCell, (responses: readonly string[]) => responses.join('|'))
          return Effect.map(collected.run(mixedItems), (response) => ({ response }))
        }),
        Then('the fold answered with every item answer in iteration order')((s) => {
          expect(s.run.response).toBe('refused:too short|admitted:4|refused:too short')
        }),
      ),
    )

    scenario(
      'A per-item Cell that fails on a read stops there and never folds',
      Gherkin.Do.pipe(
        When('a Cell that runs once per item is run over an item whose read fails')('run', () => {
          let foldCalls = 0
          const collected = Cell.collect(itemCell, (responses: readonly string[]) => {
            foldCalls += 1
            return responses.join('|')
          })
          return Effect.map(Effect.exit(collected.run(readFailingItems)), (exit) => ({ exit, foldCalls }))
        }),
        Then('the run fails with the failing item failure')((s) => {
          expect(s.run.exit).toStrictEqual(Exit.fail(new Malformed({ length: 3 })))
        }),
        And('the fold never ran')((s) => {
          expect(s.run.foldCalls).toBe(0)
        }),
      ),
    )

    scenario(
      'A per-item Cell that gathers failures answers with all of them',
      Gherkin.Do.pipe(
        When('a Cell that gathers per-item outcomes is run over an item whose read fails')('run', () => {
          let foldCalls = 0
          const gathered = Cell.collectAll(
            itemCell,
            (results: readonly Result.Result<string, Malformed>[]) => {
              foldCalls += 1
              return results.map((result) =>
                Result.match(result, {
                  onSuccess: (response) => `ok:${response}`,
                  onFailure: (malformed) => `fail:${malformed._tag}`,
                })
              )
            },
          )
          return Effect.map(gathered.run(readFailingItems), (response) => ({ response, foldCalls }))
        }),
        Then('the fold answered with every item outcome in order, the failure among them')((s) => {
          expect(s.run.response).toStrictEqual(['ok:refused:too short', 'fail:Malformed', 'ok:refused:too short'])
        }),
        And('the fold ran exactly once')((s) => {
          expect(s.run.foldCalls).toBe(1)
        }),
      ),
    )

    scenario(
      'A per-item Cell over no items folds once with nothing',
      Gherkin.Do.pipe(
        When('a folding Cell and a gathering Cell are both run over no items')('run', () => {
          const folds: (readonly unknown[])[] = []
          const collected = Cell.collect(itemCell, (responses: readonly string[]) => {
            folds.push(responses)
            return responses.length
          })
          const gathered = Cell.collectAll(
            itemCell,
            (results: readonly Result.Result<string, Malformed>[]) => {
              folds.push(results)
              return results.length
            },
          )
          return Effect.zipWith(
            collected.run([]),
            gathered.run([]),
            (failFast, accumulate) => ({ failFast, accumulate, folds }),
          )
        }),
        Then('each fold answered zero from an empty list')((s) => {
          expect(s.run.failFast).toBe(0)
          expect(s.run.accumulate).toBe(0)
          expect(s.run.folds).toEqual([[], []])
        }),
      ),
    )
  })
