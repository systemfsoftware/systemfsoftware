import { describe, it } from '@effect/vitest'

interface Line {
  readonly sku: string
  readonly quantity: number
}

const lines: ReadonlyArray<Line> = [
  { sku: 'apple', quantity: 2 },
  { sku: 'pear', quantity: 1 },
]

describe('the curated vocabulary', () => {
  it('Should_RefuseToHaveLength_When_TheClaimIsHowMany', function*({ expect }) {
    // @ts-expect-error ✗ toHaveLength checks how many, not which. Assert the contents: toEqual([...]); only some of them: toEqual(expect.arrayContaining([...])).
    yield* expect(lines).toHaveLength(2)
  })

  it('Should_RefuseToBeDefined_When_TheClaimIsPresence', function*({ expect }) {
    // @ts-expect-error ✗ toBeDefined passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).
    yield* expect(lines[0]).toBeDefined()
  })

  it('Should_RefuseToBeTypeOf_When_TheClaimIsTheKindOfValue', function*({ expect }) {
    // @ts-expect-error ✗ toBeTypeOf checks the kind of value, not the value. Assert the value: toEqual(expected); only its shape: toEqual(expect.schemaMatching(Schema)).
    yield* expect(lines[0]?.sku).toBeTypeOf('string')
  })

  it('Should_RefuseToHaveProperty_When_TheClaimIsOneKey', function*({ expect }) {
    // @ts-expect-error ✗ toHaveProperty checks one key at a time. Assert the shape once: toMatchObject({ key: value, ... }).
    yield* expect(lines[0]).toHaveProperty('sku')
  })

  it('Should_RefuseNotToBeNull_When_TheClaimIsANegatedPresence', function*({ expect }) {
    // @ts-expect-error ✗ not.toBeNull passes for almost any value the code returns. Assert the value: yield* expect(actual).toEqual(expected).
    yield* expect(lines[0]).not.toBeNull()
  })
})
