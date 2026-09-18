import { Cell, Sandwich } from '@systemfsoftware/effect-cell-types'
import { Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import {
  admitDecodedCommand,
  Admitted,
  Decoded,
  type Malformed,
  Rejected,
} from './__fixtures__/admit-decoded-command.workflow.js'

const Feature = makeFeature({ it, layer })

interface Command {
  readonly id: string
}

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

const answeringCell = Sandwich.read((command: Command) => Effect.succeed(new Decoded({ length: command.id.length })))
  .decide(admitDecodedCommand).write((outcome: Result.Result<Admitted | Rejected, Malformed>) =>
    Effect.sync(() => render(outcome))
  )

const command: Command = { id: 'abcd' }

Feature('Composing pipelines through the piped instance method').body(({ scenario }) => {
  scenario(
    'Piping map and zip through the instance answers like the module duals',
    Gherkin.Do.pipe(
      When('a labelled pipeline runs beside its twin')(
        'run',
        () => {
          const viaInstance = answeringCell.pipe(
            Cell.map((line) => `seen:${line}`),
            Cell.zip(answeringCell),
          )
          const viaDuals = Cell.zip(Cell.map(answeringCell, (line) => `seen:${line}`), answeringCell)
          return Effect.map(
            Effect.zip(viaInstance.run(command), viaDuals.run(command)),
            ([fromInstance, fromDuals]) => ({ fromInstance, fromDuals }),
          )
        },
      ),
      Then('both pipelines answer the identical paired lines')((s) => {
        expect(s.run.fromInstance).toStrictEqual(s.run.fromDuals)
        expect(s.run.fromInstance).toStrictEqual(['seen:admitted:4', 'admitted:4'] as const)
      }),
    ),
  )

  scenario(
    'A piped pipeline pipes a second time and keeps answering',
    Gherkin.Do.pipe(
      When('a counted pipeline is lengthened once more')(
        'exit',
        () => {
          const once = answeringCell.pipe(Cell.map((line) => line.length))
          const twice = once.pipe(Cell.map((count) => count + 1))
          return Effect.exit(twice.run(command))
        },
      ),
      Then('the twice-counted line length arrives')(({ exit }) => {
        expect(exit).toStrictEqual(Exit.succeed('admitted:4'.length + 1))
      }),
    ),
  )
})
