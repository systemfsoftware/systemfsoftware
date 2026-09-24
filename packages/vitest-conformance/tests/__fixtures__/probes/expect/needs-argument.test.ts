import { describe, it } from '@effect/vitest'

interface Line {
  readonly sku: string
  readonly quantity: number
}

const lines: ReadonlyArray<Line> = [
  { sku: 'apple', quantity: 2 },
  { sku: 'pear', quantity: 1 },
]

const outOfStock = (): never => {
  throw new Error('apple is out of stock')
}

describe('matchers that need their specific argument', () => {
  it('Should_RefuseToThrow_When_NoErrorIsNamed', function*({ expect }) {
    // @ts-expect-error ✗ toThrow() passes for any error. Name the one expected: toThrow(MyError) or toThrow("message"). An Effect failure is a value: const error = yield* Effect.flip(program); yield* expect(error).toEqual(new MyError(...)).
    yield* expect(outOfStock).toThrow()
  })

  it('Should_RefuseToSatisfy_When_NoReasonIsGiven', function*({ expect }) {
    // @ts-expect-error ✗ toSatisfy(predicate) fails with 'expected x to satisfy [Function]'. Say what must hold: toSatisfy(predicate, "every line has a positive quantity").
    yield* expect(lines).toSatisfy((each: Line) => each.quantity > 0)
  })

  it('Should_RefuseAnEmptyMatchObject_When_NoFieldIsNamed', function*({ expect }) {
    yield* expect(lines[0]).toMatchObject({})
  })
})
