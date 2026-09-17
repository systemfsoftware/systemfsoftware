import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import { Admitted, Decoded, Malformed, Rejected } from './__fixtures__/admit-decoded-command.workflow.js'
import { chainAdmitDecisions } from './__fixtures__/chain-admit-decisions.workflow.js'
import { SettleCommand, totalAdmitDecision } from './__fixtures__/total-admit-decision.workflow.js'
import { totalPairAdmitTaggedCommands } from './__fixtures__/total-pair-admit-tagged-commands.workflow.js'

const Feature = makeFeature({ it, layer })

type Decision = Admitted | Rejected

const render = (decision: Decision): string =>
  Match.value(decision).pipe(
    Match.tag('Admitted', (admitted) => `decided:Admitted:${admitted.length}`),
    Match.tag('Rejected', (rejected) => `decided:Rejected:${rejected.why}`),
    Match.exhaustive,
  )

const chainCell: Cell.Cell<Decoded, string, never, never> = Sandwich.read((command: Decoded) => Effect.succeed(command))
  .decide(chainAdmitDecisions).write(
    (outcome: Result.Result<Decision, Malformed>) =>
      Effect.sync(() =>
        Result.match(outcome, {
          onSuccess: render,
          onFailure: () => 'failed:Malformed',
        })
      ),
  )

const totalCell = (
  decide = totalAdmitDecision,
): Cell.Cell<SettleCommand, string, never, never> =>
  Sandwich.read((command: SettleCommand) => Effect.succeed(command)).decide(decide).write(
    (outcome: Result.Result<Decision, never>) =>
      Effect.sync(() => Result.match(outcome, { onSuccess: render, onFailure: (): string => 'failed' })),
  )

Feature('Chaining decisions across a cell')
  .body(({ scenario }) => {
    scenario(
      'A first decision that fails short-circuits the chained second',
      Gherkin.Do.pipe(
        When('a Cell chaining two decisions is run for a command the first cannot decide')(
          'run',
          () => Effect.map(chainCell.run(new Decoded({ length: -1 })), (response) => ({ response })),
        ),
        Then('the cell answers with the first failure')((s) => {
          expect(s.run.response).toBe('failed:Malformed')
        }),
      ),
    )

    scenario(
      'The first decision becomes what the second decides on',
      Gherkin.Do.pipe(
        When('a Cell chaining two decisions is run for a command the first admits')(
          'run',
          () => Effect.map(chainCell.run(new Decoded({ length: 4 })), (response) => ({ response })),
        ),
        Then('the cell answers with the second decision')((s) => {
          expect(s.run.response).toBe('decided:Admitted:4')
        }),
      ),
    )

    scenario(
      'A total decision runs as the cell decision and the outcome is the decision it made',
      Gherkin.Do.pipe(
        When('a Cell whose decision cannot fail is run')('run', () =>
          Effect.map(
            totalCell().run(new SettleCommand({ decision: new Admitted({ length: 3 }), ctx: 'total' })),
            (response) => ({ response }),
          )),
        Then('the cell outcome is the decision the command carried')((s) => {
          expect(s.run.response).toBe('decided:Admitted:3')
        }),
      ),
    )

    scenario(
      'Two total decisions compose, and both rule in order',
      Gherkin.Do.pipe(
        When('a Cell whose decision is a composite of two totals is run')('run', () =>
          Effect.map(
            totalCell(totalPairAdmitTaggedCommands).run(
              new SettleCommand({ decision: new Admitted({ length: 5 }), ctx: 'first' }),
            ),
            (response) => ({ response }),
          )),
        Then('the cell outcome is the decision the pair published')((s) => {
          expect(s.run.response).toBe('decided:Admitted:5')
        }),
      ),
    )
  })
