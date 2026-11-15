import { Sandwich } from '@systemfsoftware/effect-cell-types'
import * as Effect from 'effect/Effect'
import { describe, expect, it } from 'tstyche'

import { PrintReport } from '../tests/__fixtures__/print-report.schema.js'

interface Order {
  readonly lines: number
}

interface Offline {
  readonly offline: true
}

interface Closed {
  readonly closed: true
}

declare const readEncoded: (order: Order) => Effect.Effect<(typeof PrintReport)['Encoded'], Offline, never>
declare const readWrong: (order: Order) => Effect.Effect<{ readonly lines: string }, never, never>

describe('Sandwich.writer', () => {
  it('Should_JoinReadAndHandlerChannels_When_WritingADecodedCommand', () => {
    const cell = Sandwich.writer('report.printed')(readEncoded).decode(PrintReport).write({
      Decoded: (command) => Effect.succeed(command.lines),
      CommandRejected: () => Effect.fail<Closed>({ closed: true }),
    })
    expect(cell.run).type.toBe<(input: Order) => Effect.Effect<number, Offline | Closed, never>>()
    expect(cell.phases).type.toBe<Sandwich.WriterPhases>()
  })

  it('Should_RefuseTheChain_When_ReadDoesNotYieldTheEncodedCommand', () => {
    expect(Sandwich.writer('report.printed')(readWrong).decode(PrintReport)).type.toBe<Sandwich.ReadNotEncoded>()
  })

  it('Should_RefuseTheRecord_When_AHandlerIsMissing', () => {
    const decoded = Sandwich.writer('report.printed')(readEncoded).decode(PrintReport)
    expect<typeof decoded.write>().type.not.toBeCallableWith({ Decoded: () => Effect.void })
  })
})
