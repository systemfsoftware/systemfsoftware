import { Cell } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import { Admitted, Decoded, Malformed, Rejected } from './__fixtures__/admit-decoded-command.workflow.js'
import { chainAdmitDecisions } from './__fixtures__/chain-admit-decisions.workflow.js'
import { SettleCommand, totalAdmitDecision } from './__fixtures__/total-admit-decision.workflow.js'

const Feature = makeFeature({ it, layer })

type Decision = Admitted | Rejected

const render = (decision: Decision): string =>
  Match.value(decision).pipe(
    Match.tag('Admitted', (admitted) => `decided:Admitted:${admitted.length}`),
    Match.tag('Rejected', (rejected) => `decided:Rejected:${rejected.why}`),
    Match.exhaustive,
  )

const chainCell = (trace: string[]) =>
  Cell.layer({
    read: (command: Decoded) => Effect.succeed(command),
    decide: chainAdmitDecisions(trace),
    write: (outcome: Result.Result<Decision, Malformed>) =>
      Effect.sync(() => {
        const line = Result.match(outcome, {
          onSuccess: render,
          onFailure: () => 'failed:Malformed',
        })
        trace.push(line)
        return line
      }),
  })

const totalCell = (trace: string[]) =>
  Cell.layer({
    read: (command: SettleCommand) => Effect.succeed(command),
    decide: totalAdmitDecision(trace),
    write: (outcome: Result.Result<Decision, never>) =>
      Effect.sync(() => {
        const line = Result.match(outcome, { onSuccess: render, onFailure: (): string => 'failed' })
        trace.push(line)
        return line
      }),
  })

Feature('Chaining decisions across a cell')
  .body(({ scenario }) => {
    scenario(
      'A first decision that fails short-circuits the chained second',
      Gherkin.Do.pipe(
        When('a Cell chaining two decisions is run for a command the first cannot decide')('run', () => {
          const trace: string[] = []
          return Effect.map(chainCell(trace).run(new Decoded({ length: -1 })), (response) => ({ response, trace }))
        }),
        Then('the cell answers with the first failure')((s) => {
          expect(s.run.response).toBe('failed:Malformed')
        }),
        And('the second decision never ran')((s) => {
          expect(s.run.trace).toEqual(['failed:Malformed'])
        }),
      ),
    )

    scenario(
      'The first decision becomes what the second decides on',
      Gherkin.Do.pipe(
        When('a Cell chaining two decisions is run for a command the first admits')('run', () => {
          const trace: string[] = []
          return Effect.map(chainCell(trace).run(new Decoded({ length: 4 })), (response) => ({ response, trace }))
        }),
        Then('the cell answers with the second decision')((s) => {
          expect(s.run.response).toBe('decided:Admitted:4')
        }),
        And('the second decision ruled on the first decision')((s) => {
          expect(s.run.trace).toEqual(['settle:chain', 'decided:Admitted:4'])
        }),
      ),
    )

    scenario(
      'A total decision runs as the cell decision and the outcome is the decision it made',
      Gherkin.Do.pipe(
        When('a Cell whose decision cannot fail is run')('run', () => {
          const trace: string[] = []
          return Effect.map(
            totalCell(trace).run(new SettleCommand({ decision: new Admitted({ length: 3 }), ctx: 'total' })),
            (response) => ({ response, trace }),
          )
        }),
        Then('the cell outcome is the decision the command carried')((s) => {
          expect(s.run.response).toBe('decided:Admitted:3')
        }),
        And('the second decider ruled')((s) => {
          expect(s.run.trace).toEqual(['settle:total', 'decided:Admitted:3'])
        }),
      ),
    )
  })
