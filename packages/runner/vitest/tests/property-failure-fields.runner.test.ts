import {
  CoverageBelowMinimum,
  it,
  NonBooleanVerdict,
  PropertyRefuted,
  SelfModelLaw,
  VacuousProperty,
} from '@systemfsoftware/vitest'
import {
  type FailureRecord,
  recordOfFile,
  recordOfProperty,
  type TestIdentity,
  throwFailureRecord,
} from '@systemfsoftware/vitest/failure'
import { Effect, Match, Schema } from 'effect'

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

const selfModelOf = (record: FailureRecord | undefined): SelfModelLaw => {
  const failure = failureOf(record)
  if (Schema.is(SelfModelLaw)(failure)) return failure
  throw new Error('expected a SelfModelLaw failure')
}

const siteNamesThisFile = (site: string | null): boolean =>
  site !== null && site.includes('property-failure-fields.test.ts')

const raisesSelfModel = (record: FailureRecord | undefined): boolean =>
  record !== undefined && Schema.is(SelfModelLaw)(failureOf(record))

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

const vacuousOf = (result: { readonly vacuous: VacuousProperty | undefined }): VacuousProperty => {
  if (result.vacuous !== undefined) return result.vacuous
  throw new Error('expected a VacuousProperty verdict')
}

const firstPropertyOf = (
  vacuous: VacuousProperty,
): { readonly label: string; readonly entry: VacuousProperty['subjects'][number]['properties'][number] } => {
  const subject = vacuous.subjects[0]
  if (subject === undefined) throw new Error('expected a vacuous subject')
  const entry = subject.properties[0]
  if (entry === undefined) throw new Error('expected a vacuous property')
  return { label: subject.label, entry }
}

const emptyObject = (): Record<string, never> | undefined => ({})

const frozenEmptyObject = {
  _tag: 'Frozen',
  outputs: [{ member: 'the subject', output: { rendered: '{}', value: {} } }],
}

it('Should_CarryNameSiteSeedRunsAndFrozenOutput_When_TheSubjectIsVacuous', function*({ expect }) {
  const result = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(
        '∀x_EmptySubject_⊆Frozen',
        { of: [Schema.Literal(1)] as const, subject: emptyObject, runs: 5, arbitrary: { seed: 3 } },
        (subject) => subject() !== undefined,
      )
    })
  )
  const { label, entry } = firstPropertyOf(vacuousOf(result))
  yield* expect({
    siteIsText: typeof entry.property.site === 'string',
    label,
    name: entry.property.name,
    seed: entry.property.seed,
    runs: entry.property.runs,
    frozen: entry.frozen,
  }).toEqual({
    siteIsText: true,
    label: 'a function of 0 argument(s)',
    name: '∀x_EmptySubject_⊆Frozen',
    seed: 3,
    runs: 5,
    frozen: frozenEmptyObject,
  })
})

it('Should_ListEveryNonRefutingProperty_When_TwoShareAVacuousSubject', function*({ expect }) {
  const shared = (): Record<string, never> | undefined => ({})
  const result = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(
        '∀x_FirstOverShared_⊆Frozen',
        { of: [Schema.Literal(1)] as const, subject: shared, runs: 4, arbitrary: { seed: 11 } },
        (subject) => subject() !== undefined,
      )
      api.prop(
        '∀x_SecondOverShared_⊆Frozen',
        { of: [Schema.Literal(2)] as const, subject: shared, runs: 6, arbitrary: { seed: 12 } },
        (subject) => subject() !== undefined,
      )
    })
  )
  const vacuous = vacuousOf(result)
  yield* expect({
    subjects: vacuous.subjects.length,
    properties: vacuous.subjects[0]?.properties.map((entry) => ({
      name: entry.property.name,
      runs: entry.property.runs,
      frozen: entry.frozen,
    })),
  }).toEqual({
    subjects: 1,
    properties: [
      { name: '∀x_FirstOverShared_⊆Frozen', runs: 4, frozen: frozenEmptyObject },
      { name: '∀x_SecondOverShared_⊆Frozen', runs: 6, frozen: frozenEmptyObject },
    ],
  })
})

it('Should_ReportNeverCalled_When_TheBodyNeverCallsTheSubject', function*({ expect }) {
  const uncalled = (): number => 0
  const result = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(
        '∀x_NeverCalledSubject_⊆Frozen',
        { of: [Schema.Literal(1)] as const, subject: uncalled, runs: 2, arbitrary: { seed: 5 } },
        () => true,
      )
    })
  )
  const { entry } = firstPropertyOf(vacuousOf(result))
  yield* expect(entry.frozen).toEqual({ _tag: 'NeverCalled' })
})

it('Should_ListTheExemptLaw_When_TheFileIsRefusedAndTheLawRunsGateless', function*({ expect }) {
  const sortedSubject = (xs: ReadonlyArray<number>): ReadonlyArray<number> => [...xs].sort((a, b) => a - b)
  const result = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(
        '∀x_ExemptCompanion_⊆Frozen',
        { of: [Schema.Literal(1)] as const, subject: (): number => 0, runs: 2, arbitrary: { seed: 6 } },
        () => true,
      )
      api.law.idempotent('∀xs_Idempotent_⊆Exempt', {
        of: [Schema.Array(Schema.Int)] as const,
        subject: sortedSubject,
        runs: 5,
        arbitrary: { seed: 7 },
      })
    })
  )
  const vacuous = vacuousOf(result)
  yield* expect(vacuous.exempt).toEqual([{ name: '∀xs_Idempotent_⊆Exempt', kind: 'idempotent' }])
})

it('Should_ClearTheVerdict_When_AnyPropertyInTheFileRefutesTheImpostor', function*({ expect }) {
  const identity = (x: number): number => x
  const result = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(
        '∀x_WeakOverIdentity_⊆Frozen',
        { of: [Schema.Int] as const, subject: identity, runs: 5, arbitrary: { seed: 1 } },
        () => true,
      )
      api.prop(
        '∀x_SensitiveToInput_⊆Frozen',
        { of: [Schema.Int] as const, subject: identity, runs: 5, arbitrary: { seed: 2 } },
        (subject, [x]) => subject(x) !== subject(x + 1),
      )
    })
  )
  yield* expect(result.vacuous).toEqual(undefined)
})

it('Should_NeverRenderTheObjectString_When_TheSubjectFrozenOutputIsAnObject', function*({ expect }) {
  const result = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.prop(
        '∀x_ObjectFrozen_∉Message',
        { of: [Schema.Literal(1)] as const, subject: emptyObject, runs: 1, arbitrary: { seed: 9 } },
        (subject) => subject() !== undefined,
      )
    })
  )
  const vacuous = vacuousOf(result)
  const rendered = vacuous.subjects.flatMap((subject) =>
    subject.properties.flatMap((entry) =>
      Match.value(entry.frozen).pipe(
        Match.tag('Frozen', (frozen) => frozen.outputs.map((output) => output.output.rendered)),
        Match.tag('NeverCalled', (): ReadonlyArray<string> => []),
        Match.exhaustive,
      )
    )
  )
  yield* expect({
    message: vacuous.message.includes('[object Object]'),
    rendered: rendered.some((text) => text.includes('[object Object]')),
  }).toEqual({ message: false, rendered: false })
})

it('Should_NarrowToTheSelfModelLawWithItsNameAndSite_When_TheModelIsTheSubjectItself', function*({ expect }) {
  const selfOracle = (value: number): number => value
  const result = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.law.model(
        '∀n_ModelIsSubject_⊥Independent',
        { of: [Schema.Int] as const, subject: selfOracle, runs: 4, arbitrary: { seed: 9 } },
        selfOracle,
      )
    })
  )
  const failure = selfModelOf(result.records[0])
  yield* expect({
    tag: failure._tag,
    name: failure.name,
    siteNamesThisFile: siteNamesThisFile(failure.site),
  }).toEqual({
    tag: 'SelfModelLaw',
    name: '∀n_ModelIsSubject_⊥Independent',
    siteNamesThisFile: true,
  })
})

it('Should_RaiseNoSelfModelLaw_When_TheModelIsAnIndependentOracle', function*({ expect }) {
  const subject = (value: number): number => value
  const oracle = (value: number): number => value
  const result = yield* Effect.promise(() =>
    recordOfFile((api) => {
      api.law.model(
        '∀n_DistinctOracle_⊆Independent',
        { of: [Schema.Int] as const, subject, runs: 4, arbitrary: { seed: 9 } },
        oracle,
      )
    })
  )
  yield* expect({
    raised: raisesSelfModel(result.records[0]),
  }).toEqual({ raised: false })
})
