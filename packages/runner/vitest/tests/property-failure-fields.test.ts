import { CoverageBelowMinimum, it, NonBooleanVerdict, PropertyRefuted } from '@systemfsoftware/vitest'
import {
  type FailureRecord,
  recordOfProperty,
  type TestIdentity,
  throwFailureRecord,
} from '@systemfsoftware/vitest/failure'
import { Effect, Schema } from 'effect'

type Opaque<A = unknown> = A

const fieldOf = (value: object, key: string): Opaque => Reflect.get(value, key)

const objectOf = (value: Opaque): object => value !== null && typeof value === 'object' ? value : {}

const thrownBy = (run: () => never): object => {
  try {
    run()
  } catch (thrown: unknown) {
    return thrown instanceof Error ? thrown : new Error('the record threw a non-error', { cause: thrown })
  }
  throw new Error('expected throwFailureRecord to throw')
}

const failureOf = (record: FailureRecord | undefined): Opaque => {
  if (record === undefined) throw new Error('expected a failure record')
  return record.failure
}

const refutedOf = (record: FailureRecord | undefined): PropertyRefuted => {
  const failure = failureOf(record)
  if (Schema.is(PropertyRefuted)(failure)) return failure
  throw new Error('expected a PropertyRefuted failure')
}

const nonBooleanOf = (record: FailureRecord | undefined): NonBooleanVerdict => {
  const failure = failureOf(record)
  if (Schema.is(NonBooleanVerdict)(failure)) return failure
  throw new Error('expected a NonBooleanVerdict failure')
}

const coverageOf = (record: FailureRecord | undefined): CoverageBelowMinimum => {
  const failure = failureOf(record)
  if (Schema.is(CoverageBelowMinimum)(failure)) return failure
  throw new Error('expected a CoverageBelowMinimum failure')
}

const identityNumber = (value: number): number => value
const constantOne = (value: number): number => value

const returnsAnObject = (): boolean => {
  const verdict: { value: boolean } = { value: true }
  return Object.assign(verdict, { value: { member: 1 } }).value
}

const refutedProperty = (name: string) => ({
  name,
  spec: { of: [Schema.Literal(5)] as const, subject: identityNumber, runs: 1, arbitrary: { seed: 7 } },
  holds: (): boolean => false,
})

const notBooleanProperty = (name: string) => ({
  name,
  spec: {
    of: [Schema.Literal(3)] as const,
    subject: (): boolean => returnsAnObject(),
    runs: 1,
    arbitrary: { seed: 1 },
  },
  holds: (subject: () => boolean): boolean => subject(),
})

const IDENTITY: TestIdentity = {
  package: '@systemfsoftware/vitest',
  file: 'tests/property-failure-fields.test.ts',
  name: '∀n_Refuted_≢Itself',
}

it('Should_CarryTheShrunkCounterexampleAndItsSeed_When_ThePropertyIsRefuted', function*({ expect }) {
  const record = yield* Effect.promise(() => recordOfProperty(refutedProperty('∀n_Refuted_≢Itself')))
  const failure = refutedOf(record)
  yield* expect({
    tag: failure._tag,
    name: failure.property.name,
    seed: failure.property.seed,
    runs: failure.property.runs,
    counterexample: failure.counterexample,
  }).toEqual({
    tag: 'PropertyRefuted',
    name: '∀n_Refuted_≢Itself',
    seed: 7,
    runs: 1,
    counterexample: { rendered: '[5]', value: [5] },
  })
})

it('Should_CarryTheDrawnValuesAndTheReturnedKind_When_TheVerdictIsNotBoolean', function*({ expect }) {
  const record = yield* Effect.promise(() => recordOfProperty(notBooleanProperty('∀n_NonBoolean_⊥Object')))
  const failure = nonBooleanOf(record)
  yield* expect({
    tag: failure._tag,
    returned: failure.returned,
    drawn: failure.drawn,
  }).toEqual({
    tag: 'NonBooleanVerdict',
    returned: ['object'],
    drawn: { rendered: '[3]', value: [3] },
  })
})

it('Should_CarryTheFailedClass_When_TheCoverageClassIsBelowItsMinimum', function*({ expect }) {
  const record = yield* Effect.promise(() =>
    recordOfProperty({
      name: '∀n_Uncovered_⊇Minimum',
      spec: {
        of: [Schema.Literal(1)] as const,
        subject: constantOne,
        runs: 2048,
        cover: { never: [() => false, 0.5] },
        arbitrary: { seed: 1 },
      },
      holds: (): boolean => true,
    })
  )
  const failure = coverageOf(record)
  yield* expect({
    tag: failure._tag,
    runs: failure.property.runs,
    classes: failure.classes,
  }).toEqual({
    tag: 'CoverageBelowMinimum',
    runs: 2048,
    classes: [{ label: 'never', hits: 0, runs: 2048, minimum: 0.5 }],
  })
})

it('Should_NeverRenderTheObjectString_When_TheVerdictIsAnObject', function*({ expect }) {
  const record = yield* Effect.promise(() => recordOfProperty(notBooleanProperty('∀n_ObjectString_∉Record')))
  const failure = nonBooleanOf(record)
  yield* expect({
    message: failure.message.includes('[object Object]'),
    drawnText: failure.drawn.rendered.includes('[object Object]'),
    drawnProjection: JSON.stringify(failure.drawn.value).includes('[object Object]'),
  }).toEqual({ message: false, drawnText: false, drawnProjection: false })
})

it('Should_CopyThePropertyFieldsOntoThePrintedError_When_TheFailureIsThrown', function*({ expect }) {
  const record = yield* Effect.promise(() => recordOfProperty(refutedProperty(IDENTITY.name)))
  const failure = refutedOf(record)
  const thrown = thrownBy(() => throwFailureRecord({ failure, spans: [], identity: IDENTITY, replay: undefined }))
  yield* expect({
    tag: fieldOf(thrown, '_tag'),
    seed: fieldOf(objectOf(fieldOf(thrown, 'property')), 'seed'),
    counterexample: fieldOf(thrown, 'counterexample'),
  }).toEqual({
    tag: 'PropertyRefuted',
    seed: 7,
    counterexample: { rendered: '[5]', value: [5] },
  })
})
