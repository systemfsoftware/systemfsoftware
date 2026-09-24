import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { expect } from '@systemfsoftware/vitest'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'

import { admitDecodedCommand } from './__fixtures__/admit-decoded-command.workflow.js'

const Feature = makeFeature({ it })

interface Order {
  readonly id: string
}

interface Bytes {
  readonly body: string
}

class Ledger extends Context.Service<Ledger, {
  readonly lines: Effect.Effect<ReadonlyArray<string>>
  readonly append: (line: string) => Effect.Effect<void>
}>()('Ledger') {}

const LedgerRecording = Layer.sync(Ledger, () => {
  const lines: string[] = []
  return {
    lines: Effect.sync(() => [...lines]),
    append: (line: string) =>
      Effect.sync(() => {
        lines.push(line)
      }),
  }
})

const admitCell = Sandwich.named('cell.stages.admission')((order: Order) => Effect.succeed({ length: order.id.length }))
  .decide(admitDecodedCommand).write({
    Admitted: (decision) =>
      Effect.flatMap(
        Ledger,
        (ledger) => Effect.as(ledger.append(`admitted:${decision.length}`), `admitted:${decision.length}`),
      ),
    Rejected: (decision) =>
      Effect.flatMap(
        Ledger,
        (ledger) => Effect.as(ledger.append(`refused:${decision.why}`), `refused:${decision.why}`),
      ),
    Malformed: () => Effect.succeed('unreadable'),
    CommandRejected: () => Effect.succeed('turned away'),
  })

const relayingCell = Sandwich.named('cell.stages.relaying')((answer: string) =>
  Effect.succeed({ length: answer.length })
).decide(admitDecodedCommand).write({
  Admitted: (decision) => Effect.succeed(`second:admitted:${decision.length}`),
  Rejected: (decision) => Effect.succeed(`second:refused:${decision.why}`),
  Malformed: () => Effect.succeed('unreadable'),
  CommandRejected: () => Effect.succeed('turned away'),
})

const bodyCell = Sandwich.named('cell.stages.body')((bytes: Bytes) => Effect.succeed({ length: bytes.body.length }))
  .decide(admitDecodedCommand).write({
    Admitted: (decision) => Effect.succeed(`body:${decision.length}`),
    Rejected: (decision) => Effect.succeed(`body refused:${decision.why}`),
    Malformed: () => Effect.succeed('unreadable'),
    CommandRejected: () => Effect.succeed('turned away'),
  })

const carryingBody = Sandwich.named('cell.stages.reading')((order: Order) =>
  Effect.succeed({ length: order.id.length })
).decide(admitDecodedCommand).write({
  Admitted: (decision) => Effect.succeedSome<Bytes>({ body: '#'.repeat(decision.length) }),
  Rejected: () => Effect.succeedNone,
  Malformed: () => Effect.succeedNone,
  CommandRejected: () => Effect.succeedNone,
})

Feature('Composing admission stages into one pipeline')
  .withScenarioLayer(LedgerRecording)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'Two stages run in sequence and the second works on what the first left behind',
      Gherkin.Do.pipe(
        When('an order passes through the admission and relay stages')(
          'outcome',
          () => Effect.map(Cell.andThen(admitCell, relayingCell).run({ id: 'abcd' }), (response) => ({ response })),
        ),
        Then('the relay stage answers last')((s) => {
          expect(s.outcome.response).toBe('second:admitted:10')
        }),
        And('the admission stage kept its record')(() =>
          Effect.flatMap(Ledger, (ledger) =>
            Effect.map(ledger.lines, (lines) => {
              expect(lines).toEqual(['admitted:4'])
            }))
        ),
      ),
    )

    scenario(
      'Two stages over one order run together and hand back both answers',
      Gherkin.Do.pipe(
        When('the same order is checked by two stages at once')(
          'outcome',
          () => Effect.exit(Cell.zip(admitCell, admitCell).run({ id: 'abcd' })),
        ),
        Then('both answers arrive as a pair')((s) => {
          expect(s.outcome).toStrictEqual(Exit.succeed(['admitted:4', 'admitted:4'] as const))
        }),
      ),
    )

    scenarioOutline(
      'Orders arriving in a foreign envelope are unwrapped before the door sees them',
      [
        { rawId: 'abcd', expected: 'admitted:4' },
        { rawId: 'ab', expected: 'refused:too short' },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          When('an order arrives inside an envelope')(
            'outcome',
            () => {
              const unwrapping = Cell.mapInput(admitCell, (envelope: { readonly order: Order }) => envelope.order)
              return Effect.exit(unwrapping.run({ order: { id: row.rawId } }))
            },
          ),
          Then('the door answers the unwrapped order')((s) => {
            expect(s.outcome).toStrictEqual(Exit.succeed(row.expected))
          }),
        ),
    )

    scenarioOutline(
      'A protected stage runs only when an optional body is present',
      [
        { id: 'abcd', expected: Option.some('body:4') },
        { id: 'ab', expected: Option.none<string>() },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          When('an order reaches the protected stage')(
            'outcome',
            () => Effect.exit(Cell.gate(carryingBody, bodyCell).run({ id: row.id })),
          ),
          Then('the protected stage answers only when a body was carried')((s) => {
            expect(s.outcome).toStrictEqual(Exit.succeed(row.expected))
          }),
        ),
    )

    scenario(
      'A batch of orders is admitted one by one and the answers are folded together',
      Gherkin.Do.pipe(
        When('three orders of mixed length are admitted as a batch')(
          'outcome',
          () => {
            const batch = Cell.collect(admitCell, (answers: readonly string[]) => answers.join('|'))
            return Effect.map(batch.run([{ id: 'a' }, { id: 'bbbb' }, { id: 'cc' }]), (response) => ({ response }))
          },
        ),
        Then('the folded answer names every order in turn')((s) => {
          expect(s.outcome.response).toBe('refused:too short|admitted:4|refused:too short')
        }),
      ),
    )
  })
