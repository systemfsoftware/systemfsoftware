import { Sandwich } from '@systemfsoftware/effect-cell-types'
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

const chainCell = Sandwich.read((command: Decoded) => Effect.succeed(command))
  .decide(chainAdmitDecisions).write(
    (outcome: Result.Result<Decision, Malformed>) =>
      Effect.sync(() =>
        Result.match(outcome, {
          onSuccess: render,
          onFailure: () => 'failed:Malformed',
        })
      ),
  )

const totalCell = (decide = totalAdmitDecision) =>
  Sandwich.read((command: SettleCommand) => Effect.succeed(command)).decide(decide).write(
    (outcome: Result.Result<Decision, never>) =>
      Effect.sync(() => Result.match(outcome, { onSuccess: render, onFailure: (): string => 'failed' })),
  )

Feature('Sequencing dependent decisions')
  .body(({ scenarioOutline }) => {
    scenarioOutline(
      'Early decision rejection halts evaluation while acceptance proceeds to subsequent rules',
      [
        {
          commandLength: -1,
          expectedResponse: 'failed:Malformed',
        },
        {
          commandLength: 4,
          expectedResponse: 'decided:Admitted:4',
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          When('evaluating a multi-stage decision pipeline')(
            'run',
            () => Effect.map(chainCell.run(new Decoded({ length: row.commandLength })), (response) => ({ response })),
          ),
          Then('the pipeline produces the expected outcome')((s) => {
            expect(s.run.response).toBe(row.expectedResponse)
          }),
        ),
    )

    scenarioOutline(
      'Infallible decisions evaluate directly to their determined resolution',
      [
        {
          composite: false,
          decisionLength: 3,
          ctx: 'total',
          expectedResponse: 'decided:Admitted:3',
        },
        {
          composite: true,
          decisionLength: 5,
          ctx: 'first',
          expectedResponse: 'decided:Admitted:5',
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          When('evaluating an infallible decision')(
            'run',
            () => {
              let targetCell = totalCell()
              if (row.composite) {
                targetCell = totalCell(totalPairAdmitTaggedCommands)
              }
              return Effect.map(
                targetCell.run(
                  new SettleCommand({ decision: new Admitted({ length: row.decisionLength }), ctx: row.ctx }),
                ),
                (response) => ({ response }),
              )
            },
          ),
          Then('the decision output matches the resolved conclusion')((s) => {
            expect(s.run.response).toBe(row.expectedResponse)
          }),
        ),
    )
  })
