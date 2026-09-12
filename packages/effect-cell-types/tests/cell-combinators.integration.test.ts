import { Cell } from '@systemfsoftware/effect-cell-types'
import { And, Gherkin, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { expect } from 'vitest'

import {
  admitDecodedCommand as decideFixture,
  Admitted,
  Decoded,
  Malformed,
  Rejected,
} from './__fixtures__/admit-decoded-command.workflow.js'

const Feature = makeFeature({ it, layer })

interface Command {
  readonly id: string
}

/** What a gate's reader admits and its inner Cell consumes. */
interface Bytes {
  readonly bytes: string
}

const items: readonly Command[] = [{ id: 'a' }, { id: 'bbbb' }, { id: 'cc' }]
const refusingItems: readonly Command[] = [{ id: 'a' }, { id: 'bad' }, { id: 'cc' }]

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

const readerCell = (trace: string[], response: Option.Option<Bytes>) =>
  Cell.layer({
    read: (command: Command) =>
      Effect.sync(() => {
        trace.push('reader:read')
        return new Decoded({ length: command.id.length })
      }),
    decide: decideFixture,
    write: () =>
      Effect.sync(() => {
        trace.push('reader:write')
        return response
      }),
  })

const readerThatFails = (trace: string[]) =>
  Cell.layer({
    read: (command: Command) =>
      Effect.gen(function*() {
        trace.push('reader:read')
        return yield* Effect.fail(new Malformed({ length: command.id.length }))
      }),
    decide: decideFixture,
    write: () =>
      Effect.sync(() => {
        trace.push('reader:write')
        return Option.none<Bytes>()
      }),
  })

const innerCell = (trace: string[]) =>
  Cell.layer({
    read: (bytes: Bytes) =>
      Effect.sync(() => {
        trace.push('inner:read')
        return new Decoded({ length: bytes.bytes.length })
      }),
    decide: decideFixture,
    write: (outcome: Result.Result<Admitted | Rejected, Malformed>) =>
      Effect.sync(() => {
        trace.push('inner:write')
        return render(outcome)
      }),
  })

const innerCellThatFails = (trace: string[]) =>
  Cell.layer({
    read: (bytes: Bytes) =>
      Effect.gen(function*() {
        trace.push('inner:read')
        return yield* Effect.fail(new Malformed({ length: bytes.bytes.length }))
      }),
    decide: decideFixture,
    write: (outcome: Result.Result<Admitted | Rejected, Malformed>) =>
      Effect.sync(() => {
        trace.push('inner:write')
        return render(outcome)
      }),
  })

const itemCell = (trace: string[]) =>
  Cell.layer({
    read: (command: Command) =>
      Effect.gen(function*() {
        trace.push(`item:read:${command.id}`)
        const decoded = new Decoded({ length: command.id.length })
        if (command.id === 'bad') {
          return yield* Effect.fail(new Malformed({ length: decoded.length }))
        }
        return decoded
      }),
    decide: decideFixture,
    write: (outcome: Result.Result<Admitted | Rejected, Malformed>, raw: Decoded) =>
      Effect.sync(() => {
        trace.push(`item:write:${raw.length}`)
        return render(outcome)
      }),
  })

Feature('Gating and collecting Cells')
  .body(({ scenario }) => {
    scenario(
      'A gate whose reader admits nothing never runs the inner cell',
      Gherkin.Do.pipe(
        When('a gate whose reader admits nothing is run')('run', () => {
          const trace: string[] = []
          const gated = Cell.gate(readerCell(trace, Option.none()), innerCell(trace))
          return Effect.map(gated.run({ id: 'abcd' }), (response) => ({ response, trace }))
        }),
        Then('the response is empty')((s) => {
          expect(Option.isNone(s.run.response)).toBe(true)
          expect(s.run.response).toStrictEqual(Option.none<Bytes>())
        }),
        And('the inner cell never ran a phase')((s) => {
          expect(s.run.trace).toEqual(['reader:read', 'reader:write'])
          expect(s.run.trace).not.toContain('inner:read')
          expect(s.run.trace).not.toContain('inner:write')
        }),
      ),
    )

    scenario(
      'A gate that admits a value runs the inner cell on it',
      Gherkin.Do.pipe(
        When('a gate whose reader admits bytes is run')('run', () => {
          const trace: string[] = []
          const gated = Cell.gate(readerCell(trace, Option.some({ bytes: 'abcd' })), innerCell(trace))
          return Effect.map(gated.run({ id: 'abcd' }), (response) => ({ response, trace }))
        }),
        Then('the response carries the inner cell response')((s) => {
          expect(s.run.response).toStrictEqual(Option.some('admitted:4'))
        }),
        And('the inner cell ran its phases after the reader')((s) => {
          expect(s.run.trace).toEqual(['reader:read', 'reader:write', 'inner:read', 'inner:write'])
        }),
      ),
    )

    scenario(
      'A reader failure fails the gate rather than answering empty',
      Gherkin.Do.pipe(
        When('a gate whose reader fails is run')('run', () => {
          const trace: string[] = []
          const gated = Cell.gate(readerThatFails(trace), innerCell(trace))
          return Effect.map(Effect.exit(gated.run({ id: 'abcd' })), (exit) => ({ exit, trace }))
        }),
        Then('the run fails with the reader refusal')((s) => {
          expect(s.run.exit).toStrictEqual(Exit.fail(new Malformed({ length: 4 })))
        }),
        And('the inner cell never ran a phase')((s) => {
          expect(s.run.trace).toEqual(['reader:read'])
        }),
      ),
    )

    scenario(
      'An inner failure fails the gate rather than answering empty',
      Gherkin.Do.pipe(
        When('a gate whose inner cell fails is run')('run', () => {
          const trace: string[] = []
          const gated = Cell.gate(readerCell(trace, Option.some({ bytes: 'abcd' })), innerCellThatFails(trace))
          return Effect.map(Effect.exit(gated.run({ id: 'abcd' })), (exit) => ({ exit, trace }))
        }),
        Then('the run fails with the inner refusal')((s) => {
          expect(s.run.exit).toStrictEqual(Exit.fail(new Malformed({ length: 4 })))
        }),
        And('the inner read ran and its write did not')((s) => {
          expect(s.run.trace).toEqual(['reader:read', 'reader:write', 'inner:read'])
        }),
      ),
    )

    scenario(
      'A collect runs its cell once per item and folds every response in order',
      Gherkin.Do.pipe(
        When('a collect runs over three items the decision admits and refuses in turn')('run', () => {
          const trace: string[] = []
          const folded: (readonly string[])[] = []
          const collected = Cell.collect(itemCell(trace), (responses: readonly string[]) => {
            folded.push(responses)
            return responses.join('|')
          })
          return Effect.map(collected.run(items), (response) => ({ response, trace, folded }))
        }),
        Then('the fold received every response in iteration order')((s) => {
          expect(s.run.folded).toEqual([['refused:too short', 'admitted:4', 'refused:too short']])
          expect(s.run.response).toBe('refused:too short|admitted:4|refused:too short')
        }),
        And('the cell ran its phases once per item, in order')((s) => {
          expect(s.run.trace).toEqual([
            'item:read:a',
            'item:write:1',
            'item:read:bbbb',
            'item:write:4',
            'item:read:cc',
            'item:write:2',
          ])
        }),
      ),
    )

    scenario(
      'A collect that fails on the first refusal never folds',
      Gherkin.Do.pipe(
        When('a collect runs over an item whose read refuses')('run', () => {
          const trace: string[] = []
          const folded: (readonly string[])[] = []
          const collected = Cell.collect(itemCell(trace), (responses: readonly string[]) => {
            folded.push(responses)
            return responses.join('|')
          })
          return Effect.map(Effect.exit(collected.run(refusingItems)), (exit) => ({ exit, trace, folded }))
        }),
        Then('the run fails with the refusing item refusal')((s) => {
          expect(s.run.exit).toStrictEqual(Exit.fail(new Malformed({ length: 3 })))
        }),
        And('the fold never ran and the item after the refusal was never read')((s) => {
          expect(s.run.folded).toEqual([])
          expect(s.run.trace).toEqual(['item:read:a', 'item:write:1', 'item:read:bad'])
        }),
      ),
    )

    scenario(
      'An accumulate collect delivers every result, refusals included',
      Gherkin.Do.pipe(
        When('an accumulate collect runs over an item whose read refuses')('run', () => {
          const trace: string[] = []
          const gathered: (readonly Result.Result<string, Malformed>[])[] = []
          const accumulated = Cell.collectAll(
            itemCell(trace),
            (results: readonly Result.Result<string, Malformed>[]) => {
              gathered.push(results)
              return results.map((result) =>
                Result.match(result, {
                  onSuccess: (response) => `ok:${response}`,
                  onFailure: (malformed) => `fail:${malformed._tag}`,
                })
              )
            },
          )
          return Effect.map(accumulated.run(refusingItems), (response) => ({ response, trace, gathered }))
        }),
        Then('the fold received all three results in order, the refusal as data')((s) => {
          expect(s.run.response).toStrictEqual(['ok:refused:too short', 'fail:Malformed', 'ok:refused:too short'])
          expect(s.run.gathered).toHaveLength(1)
        }),
        And('every item ran, including the one after the refusal')((s) => {
          expect(s.run.trace).toEqual(['item:read:a', 'item:write:1', 'item:read:bad', 'item:read:cc', 'item:write:2'])
        }),
      ),
    )

    scenario(
      'An empty collection hands both folds the empty list',
      Gherkin.Do.pipe(
        When('a collect and an accumulate collect run over no items')('run', () => {
          const trace: string[] = []
          const folded: (readonly string[])[] = []
          const gathered: (readonly Result.Result<string, Malformed>[])[] = []
          const collected = Cell.collect(itemCell(trace), (responses: readonly string[]) => {
            folded.push(responses)
            return responses.length
          })
          const accumulated = Cell.collectAll(
            itemCell(trace),
            (results: readonly Result.Result<string, Malformed>[]) => {
              gathered.push(results)
              return results.length
            },
          )
          return Effect.zipWith(
            collected.run([]),
            accumulated.run([]),
            (failFast, accumulate) => ({ failFast, accumulate, trace, folded, gathered }),
          )
        }),
        Then('each fold ran once with no results')((s) => {
          expect(s.run.failFast).toBe(0)
          expect(s.run.accumulate).toBe(0)
          expect(s.run.folded).toEqual([[]])
          expect(s.run.gathered).toEqual([[]])
        }),
        And('the cell never ran a phase')((s) => {
          expect(s.run.trace).toEqual([])
        }),
      ),
    )
  })
