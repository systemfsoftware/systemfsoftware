import { Cell } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import { Admitted, Decoded, Malformed, Rejected } from './__fixtures__/admit-decoded-command.workflow.js'
import { chainAdmitDecisions } from './__fixtures__/chain-admit-decisions.workflow.js'
import { SettleCommand, totalAdmitDecision } from './__fixtures__/total-admit-decision.workflow.js'

const Feature = makeFeature({ it, layer })

type Decision = Admitted | Rejected

const renderDecision = (decision: Decision): string =>
  Match.value(decision).pipe(
    Match.tag('Admitted', () => 'decided:Admitted'),
    Match.tag('Rejected', () => 'decided:Rejected'),
    Match.exhaustive,
  )

/**
 * Both cells share one trace. The decisions are the workflows the fixtures own, so this file
 * constructs nothing: `make-file-location` permits a construction only in a `<stem>.workflow.ts`,
 * and a workflow only a test uses lives in `tests/__fixtures__/<stem>.workflow.ts`.
 */
const makeChain = (trace: string[]) => {
  const chainCell = Cell.layer({
    read: (command: Decoded) => Effect.succeed(command),
    decide: chainAdmitDecisions(trace),
    write: (outcome: Result.Result<Decision, Malformed>) =>
      Effect.sync(() => {
        trace.push(
          Result.match(outcome, {
            onSuccess: renderDecision,
            onFailure: (malformed) =>
              Match.value(malformed).pipe(Match.tag('Malformed', () => 'refused:Malformed'), Match.exhaustive),
          }),
        )
      }),
  })

  const totalCell = Cell.layer({
    read: (command: SettleCommand) => Effect.succeed(command),
    decide: totalAdmitDecision(trace),
    write: (outcome: Result.Result<Decision, never>) =>
      Effect.sync(() => {
        trace.push(
          Result.match(outcome, {
            onSuccess: renderDecision,
            onFailure: (): string => 'refused',
          }),
        )
      }),
  })

  return {
    chainCell,
    totalCell,
    settleCommand: (decision: Decision): SettleCommand => new SettleCommand({ decision }),
  }
}

Feature('Chaining two decisions inside one cell')
  .body(({ scenario }) => {
    scenario(
      'A refusal in the first decision short-circuits the second',
      Gherkin.Do.pipe(
        When('the first decision refuses a command the second is chained behind')('run', () => {
          const trace: string[] = []
          const { chainCell } = makeChain(trace)
          return Effect.map(
            Effect.exit(chainCell.run(new Decoded({ length: -1 }))),
            (exit) => ({ exit, trace }),
          )
        }),
        Then('the cell reports the first refusal as its outcome')((s) => {
          expect(s.run.exit).toStrictEqual(Exit.succeed(undefined))
          expect(s.run.trace).toEqual(['refused:Malformed'])
        }),
        And('the second decision never ran')((s) => {
          expect(s.run.trace).not.toContain('settle')
        }),
      ),
    )

    scenario(
      'The first decision becomes what the second decides on',
      Gherkin.Do.pipe(
        When('the first decision admits the command')('run', () => {
          const trace: string[] = []
          const { chainCell } = makeChain(trace)
          return Effect.map(
            Effect.exit(chainCell.run(new Decoded({ length: 5 }))),
            (exit) => ({ exit, trace }),
          )
        }),
        Then('the second decision decides on the first decision')((s) => {
          expect(s.run.exit).toStrictEqual(Exit.succeed(undefined))
          expect(s.run.trace).toEqual(['settle', 'decided:Admitted'])
        }),
      ),
    )

    scenario(
      'A decision that cannot fail stands as a cell decision on its own',
      Gherkin.Do.pipe(
        When('a cell whose decision cannot fail is run')('run', () => {
          const trace: string[] = []
          const { totalCell, settleCommand } = makeChain(trace)
          return Effect.map(
            Effect.exit(totalCell.run(settleCommand(new Admitted({ length: 5 })))),
            (exit) => ({ exit, trace }),
          )
        }),
        Then('the cell outcome is the decision it made')((s) => {
          expect(s.run.exit).toStrictEqual(Exit.succeed(undefined))
          expect(s.run.trace).toEqual(['settle', 'decided:Admitted'])
        }),
      ),
    )
  })
