import { describe, it } from '@systemfsoftware/vitest'

const doubled = (quantity: number): number => quantity * 2

const rows = [
  { id: 'OneApple', quantity: 1, doubled: 2 },
  { id: 'TwoApples', quantity: 2, doubled: 4 },
]

describe('it.each judges each row once', () => {
  it.each(rows)('Should_JudgeTheRow_When_$id', function*(row, { expect }) {
    yield* expect(doubled(row.quantity)).toEqual(row.doubled)
  })
})
