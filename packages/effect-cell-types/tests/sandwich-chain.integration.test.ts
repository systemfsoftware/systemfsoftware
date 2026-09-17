import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import { Admitted, Decoded, Malformed, Rejected } from './__fixtures__/admit-decoded-command.workflow.js'
import { admitTracedCommand } from './__fixtures__/admit-traced-command.workflow.js'

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

const tracedCell = (trace: Array<string>) =>
  Sandwich.read((command: Command) =>
    Effect.sync(() => {
      trace.push('read')
      return { bytes: command.id }
    })
  ).decode(
    Sandwich.pure((raw: Raw): Result.Result<Decoded, Malformed> => {
      trace.push('decode')
      return Match.value(raw.bytes).pipe(
        Match.when('bad', () => Result.fail(new Malformed({ length: raw.bytes.length }))),
        Match.orElse(() => Result.succeed(new Decoded({ length: raw.bytes.length }))),
      )
    }),
  ).decide(admitTracedCommand(trace, new Admitted({ length: 0 }), new Rejected({ why: 'traced refusal' }))).encode(
    Sandwich.pure((outcome: Result.Result<Admitted | Rejected, Malformed>): Result.Result<Output, never> => {
      trace.push('encode')
      return Result.succeed({ line: render(outcome) })
    }),
  ).write((output: Output) =>
    Effect.sync(() => {
      trace.push('write')
      return output.line
    })
  )

const tracedRawCell = (trace: Array<string>) =>
  Sandwich.read((command: Command) =>
    Effect.sync(() => {
      trace.push('read')
      return new Decoded({ length: command.id.length })
    })
  ).decide(admitTracedCommand(trace, new Admitted({ length: 0 }), new Rejected({ why: 'traced refusal' }))).write(
    (outcome: Result.Result<Admitted | Rejected, Malformed>) =>
      Effect.sync(() => {
        trace.push('write')
        return render(outcome)
      }),
  )

const refusingTracedCell = (trace: Array<string>) =>
  Sandwich.read((command: Command) =>
    Effect.sync(() => {
      trace.push('read')
      return { bytes: command.id }
    })
  ).decode(
    Sandwich.pure((raw: Raw): Result.Result<Decoded, Malformed> => {
      trace.push('decode')
      return Result.succeed(new Decoded({ length: raw.bytes.length }))
    }),
  ).decide(
    admitTracedCommand(trace, new Admitted({ length: 0 }), new Rejected({ why: 'too short' })),
  ).encode(
    Sandwich.pure((outcome: Result.Result<Admitted | Rejected, Malformed>): Result.Result<Output, never> => {
      trace.push('encode')
      return Result.succeed({ line: render(outcome) })
    }),
  ).write((output: Output, raw: Raw) =>
    Effect.sync(() => {
      trace.push('write')
      return `${output.line}<-${raw.bytes}`
    })
  )
Feature('Building a cell one step at a time').body(({ scenario }) => {
  scenario(
    'Each step of a full chain runs once in the order it was added',
    Gherkin.Do.pipe(
      When('a fully assembled chain is run')('outcome', () => {
        const trace: Array<string> = []
        return Effect.map(tracedCell(trace).run({ id: 'abc' }), (response) => ({ response, trace }))
      }),
      Then('every step ran once in assembly order')((s) => {
        expect(s.outcome.trace).toEqual(['read', 'decode', 'decide', 'encode', 'write'])
        expect(s.outcome.response).toBe('admitted:0')
      }),
      And('the recorded steps name the full chain')(() => {
        expect(tracedCell([]).phases).toEqual(['read', 'decode', 'decide', 'encode', 'write'])
      }),
    ),
  )

  scenario(
    'A short chain records the three steps it ran',
    Gherkin.Do.pipe(
      When('a chain without the middle steps is run')('outcome', () => {
        const trace: Array<string> = []
        return Effect.map(tracedRawCell(trace).run({ id: 'abc' }), (response) => ({ response, trace }))
      }),
      Then('only the assembled steps ran')((s) => {
        expect(s.outcome.trace).toEqual(['read', 'decide', 'write'])
        expect(s.outcome.response).toBe('admitted:0')
      }),
      And('the recorded steps name the short chain')(() => {
        expect(tracedRawCell([]).phases).toEqual(['read', 'decide', 'write'])
      }),
    ),
  )

  scenario(
    'A refusal is delivered to the writer as a result',
    Gherkin.Do.pipe(
      When('a chain is run for a command the decider turns down')('outcome', () => {
        const trace: Array<string> = []
        return Effect.map(
          Effect.exit(refusingTracedCell(trace).run({ id: 'a'.repeat(101) })),
          (exit) => ({ exit, trace }),
        )
      }),
      Then('the run succeeds carrying the refusal and every step ran')((s) => {
        expect(s.outcome.exit).toStrictEqual(Exit.succeed(`refused:too short<-${'a'.repeat(101)}`))
        expect(s.outcome.trace).toEqual(['read', 'decode', 'decide', 'encode', 'write'])
      }),
    ),
  )

  scenario(
    'A rejected reading stops the chain before the decision',
    Gherkin.Do.pipe(
      When('a chain is run for a command the validation turns down')('outcome', () => {
        const trace: Array<string> = []
        return Effect.map(Effect.exit(tracedCell(trace).run({ id: 'bad' })), (exit) => ({ exit, trace }))
      }),
      Then('the run fails and nothing past the reading ran')((s) => {
        expect(s.outcome.exit).toStrictEqual(Exit.fail(new Malformed({ length: 3 })))
        expect(s.outcome.trace).toEqual(['read', 'decode'])
      }),
    ),
  )
})
