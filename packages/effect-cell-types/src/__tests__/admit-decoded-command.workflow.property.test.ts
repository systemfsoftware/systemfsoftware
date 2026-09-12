import { describe, it } from '@effect/vitest'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import { FastCheck as fc } from 'effect/testing'

import { admitDecodedCommand, Admitted, Decoded, Malformed, Rejected } from '../admit-decoded-command.workflow.js'
import * as Cell from '../Cell.js'

interface Command {
  readonly id: string
}

interface Bytes {
  readonly bytes: string
}

const ADMITTING = ['bbbb', 'ccccc'] as const
const REFUSING = ['aa', 'b'] as const
const READ_FAILURE = 'bad'

const DECIDED_ANSWER_BY_ID: Record<string, string> = {
  bbbb: 'admitted:4',
  ccccc: 'admitted:5',
  aa: 'refused:too short',
  b: 'refused:too short',
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

const commands = (ids: readonly string[]): readonly Command[] => ids.map((id) => ({ id }))

const itemCell = (trace: string[]) =>
  Cell.layer({
    read: (command: Command) =>
      Effect.gen(function*() {
        trace.push(`item:read:${command.id}`)
        const decoded = new Decoded({ length: command.id.length })
        return command.id === READ_FAILURE ? yield* Effect.fail(new Malformed({ length: decoded.length })) : decoded
      }),
    decide: admitDecodedCommand,
    write: (outcome: Result.Result<Admitted | Rejected, Malformed>, raw: Decoded) =>
      Effect.sync(() => {
        trace.push(`item:write:${raw.length}`)
        return render(outcome)
      }),
  })

const readerCell = (trace: string[], admitted: Option.Option<Bytes>) =>
  Cell.layer({
    read: (command: Command) =>
      Effect.sync(() => {
        trace.push('reader:read')
        return new Decoded({ length: command.id.length })
      }),
    decide: admitDecodedCommand,
    write: () =>
      Effect.sync(() => {
        trace.push('reader:write')
        return admitted
      }),
  })

const innerCell = (trace: string[]) =>
  Cell.layer({
    read: (bytes: Bytes) =>
      Effect.sync(() => {
        trace.push('inner:read')
        return new Decoded({ length: bytes.bytes.length })
      }),
    decide: admitDecodedCommand,
    write: (outcome: Result.Result<Admitted | Rejected, Malformed>) =>
      Effect.sync(() => {
        trace.push('inner:write')
        return render(outcome)
      }),
  })

const openingCell = (label: string, ledger: string[]) =>
  Cell.layer({
    read: (command: Command) => Effect.succeed(new Decoded({ length: command.id.length })),
    decide: admitDecodedCommand,
    write: (outcome: Result.Result<Admitted | Rejected, Malformed>, raw: Decoded) =>
      Effect.sync(() => {
        const line = `${label}:${render(outcome)}:${raw.length}`
        ledger.push(line)
        return line
      }),
  })

const stageCell = (label: string, ledger: string[]) =>
  Cell.layer({
    read: (line: string) => Effect.succeed(new Decoded({ length: line.length })),
    decide: admitDecodedCommand,
    write: (outcome: Result.Result<Admitted | Rejected, Malformed>, raw: Decoded) =>
      Effect.sync(() => {
        const line = `${label}:${render(outcome)}:${raw.length}`
        ledger.push(line)
        return line
      }),
  })

const foldTo = (responses: readonly string[]): string => responses.join('|')

const admittingArb = fc.array(fc.constantFrom(...ADMITTING, ...REFUSING), { maxLength: 8 })
const mixedArb = fc.array(fc.constantFrom(...ADMITTING, ...REFUSING, READ_FAILURE), { maxLength: 8 })
const shortArb = fc.array(fc.constantFrom(...ADMITTING, ...REFUSING), { maxLength: 5 })

describe('folding a cell over items', () => {
  it.prop('∀xs_CollectFold_≡ResponsesInOrder', [admittingArb], ([ids]) => {
    const trace: string[] = []
    const response = Effect.runSync(Cell.collect(itemCell(trace), foldTo).run(commands(ids)))
    return response === ids.map((id) => DECIDED_ANSWER_BY_ID[id]).join('|')
  })

  it.prop('∀prepost_ReadFailure_≡FailThereAndSuffixUnread', [shortArb, shortArb], ([pre, post]) => {
    const trace: string[] = []
    const attempt = Effect.runSync(
      Effect.result(Cell.collect(itemCell(trace), foldTo).run(commands([...pre, READ_FAILURE, ...post]))),
    )
    const expectedTrace = [
      ...pre.flatMap((id) => [`item:read:${id}`, `item:write:${id.length}`]),
      `item:read:${READ_FAILURE}`,
    ]
    return Result.isFailure(attempt) &&
      attempt.failure._tag === 'Malformed' &&
      attempt.failure.length === READ_FAILURE.length &&
      trace.every((step, index) => step === expectedTrace[index]) &&
      trace.length === expectedTrace.length
  })

  it.prop('∀xs_GatherFold_≡OneResultPerItemInOrder', [mixedArb], ([ids]) => {
    const trace: string[] = []
    const response = Effect.runSync(
      Cell.collectAll(
        itemCell(trace),
        (results: readonly Result.Result<string, Malformed>[]) =>
          results.map((result) =>
            Result.match(result, {
              onSuccess: (answered) => `ok:${answered}`,
              onFailure: (malformed) => `fail:${malformed._tag}`,
            })
          ),
      ).run(commands(ids)),
    )
    const expectedResponse = ids.map((
      id,
    ) => (id === READ_FAILURE ? 'fail:Malformed' : `ok:${DECIDED_ANSWER_BY_ID[id]}`))
    const expectedTrace = ids.flatMap((id) =>
      id === READ_FAILURE ? [`item:read:${id}`] : [`item:read:${id}`, `item:write:${id.length}`]
    )
    return response.every((entry, index) => entry === expectedResponse[index]) &&
      response.length === expectedResponse.length &&
      trace.every((step, index) => step === expectedTrace[index]) &&
      trace.length === expectedTrace.length
  })

  it.prop('∀xs_FoldCount_≡One', [admittingArb], ([ids]) => {
    let collectCalls = 0
    let accumulateCalls = 0
    Effect.runSync(
      Cell.collect(itemCell([]), (responses: readonly string[]) => {
        collectCalls += 1
        return responses.length
      }).run(commands(ids)),
    )
    Effect.runSync(
      Cell.collectAll(itemCell([]), (results: readonly Result.Result<string, Malformed>[]) => {
        accumulateCalls += 1
        return results.length
      }).run(commands(ids)),
    )
    return collectCalls === 1 && accumulateCalls === 1
  })
})

describe('chaining and gating cells', () => {
  it.prop('∀abc_Chain_≡Associative', [fc.constantFrom(...ADMITTING, ...REFUSING)], ([id]) => {
    const leftLedger: string[] = []
    const rightLedger: string[] = []

    const left = Effect.runSync(
      Cell.andThen(
        openingCell('one', leftLedger),
        Cell.andThen(stageCell('two', leftLedger), stageCell('three', leftLedger)),
      ).run({ id }),
    )
    const right = Effect.runSync(
      Cell.andThen(
        Cell.andThen(openingCell('one', rightLedger), stageCell('two', rightLedger)),
        stageCell('three', rightLedger),
      ).run({ id }),
    )
    return left === right &&
      leftLedger.every((line, index) => line === rightLedger[index]) &&
      leftLedger.length === rightLedger.length
  })

  it.prop(
    '∀v_GateInner_≡RunsIffSome',
    [fc.option(fc.constantFrom(...ADMITTING, ...REFUSING), { nil: null })],
    ([admitted]) => {
      const trace: string[] = []
      const option = admitted === null ? Option.none<Bytes>() : Option.some<Bytes>({ bytes: admitted })
      const response = Effect.runSync(Cell.gate(readerCell(trace, option), innerCell(trace)).run({ id: 'aa' }))
      const innerRan = trace.includes('inner:read') && trace.includes('inner:write')
      return Option.isSome(option)
        ? Option.isSome(response) && innerRan
        : Option.isNone(response) && !innerRan
    },
  )
})
