import { describe, it } from '@systemfsoftware/vitest'

describe('a boolean actual', () => {
  it('Should_RefuseTheBooleanActual_When_TheCheckCanOnlyReportTrue', function*({ expect }) {
    const holds = 1 + 1 === 2
    // @ts-expect-error ✗ expect(<boolean>) can only report 'expected false to be true'. Pass the two values instead: yield* expect(a).toEqual(b), which uses Effect Equal. A predicate: yield* expect(value).toSatisfy(predicate, "what must hold").
    yield* expect(holds).toEqual(true)
  })
})
