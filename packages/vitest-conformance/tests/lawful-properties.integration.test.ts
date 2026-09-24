import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { assertionOf, fileOf, type JsonReport, messagesOf, namesOf, runFixtures } from './support/run-fixtures'

const CHEATS = ['cheats/property-shape.test.ts']
const LAW_KINDS = 'property/law-kinds.test.ts'

const LAWS_THAT_HOLD = [
  'Should_AgreeWithItself_When_TheInputOrderIsReversed',
  'Should_RoundTrip_When_TheTextIsDecodedBack',
  'Should_KeepTheLength_When_TheInputIsSorted',
] as const

const LAWS_THAT_FALSIFY = [
  'Should_Falsify_When_TheSubjectKeepsOnlyTheFirstElement',
  'Should_Falsify_When_TheSubjectEncodesTheNextNumber',
  'Should_Falsify_When_TheSubjectAppendsAnElement',
] as const

const messagesFor = (report: JsonReport, fullName: string): string => messagesOf(report, fullName)

const assertFileFailedWith = (report: JsonReport, needle: string): void => {
  const file = fileOf(report, 'property-shape.test.ts')
  expect(file.status).toBe('failed')
  expect(file.message).toContain(needle)
}

const runCheats = (): Promise<void> =>
  Effect.gen(function*() {
    const report = yield* runFixtures(CHEATS)
    expect(report.numTotalTests).toBeGreaterThan(0)
    assertFileFailedWith(report, 'no property in this file refuted')
  }).pipe(Effect.runPromise)

const shouldContain = (fullName: string, needle: string): Promise<void> =>
  Effect.gen(function*() {
    const report = yield* runFixtures(CHEATS)
    expect(messagesFor(report, fullName)).toContain(needle)
    expect(report.numFailedTests).toBeGreaterThan(0)
  }).pipe(Effect.runPromise)

describe('lawful properties (R11-R15)', () => {
  it('passes a genuine property and fails the constant-impostor cheat with VacuousProperty', () =>
    Effect.gen(function*() {
      const report = yield* runFixtures(CHEATS)
      expect(assertionOf(report, 'sort keeps every element').status).toBe('passed')
      expect(fileOf(report, 'property-shape.test.ts').status).toBe('failed')
      expect(fileOf(report, 'property-shape.test.ts').message).toContain('no property in this file refuted')
      expect(namesOf(report)).toContain('sort is stable-ish')
    }).pipe(Effect.runPromise))

  it('reports the model law as a pinned property', () => {
    expect(CHEATS.length).toBe(1)
    return runCheats()
  })

  it('fails a property with a missing runs budget (MissingBudget)', () => {
    expect(CHEATS[0]).toContain('property-shape')
    return shouldContain('missing budget', 'positive integer `runs`')
  })

  it('fails a property whose verdict is an Effect on the sync lane (NonBooleanVerdict)', () => {
    expect(CHEATS).toHaveLength(1)
    return shouldContain('non boolean verdict', 'no boolean')
  })

  it('fails a coverage class below its minimum, naming the label and the observed share', () => {
    expect(CHEATS[0]).not.toBe('')
    return shouldContain('sorts singletons', 'singletons')
  })

  it('judges a subject whose first output is undefined against a constant impostor', () =>
    Effect.gen(function*() {
      const report = yield* runFixtures(['property/undefined-output.test.ts'])
      expect(fileOf(report, 'undefined-output.test.ts').status).toBe('passed')
      expect(assertionOf(report, 'a subject whose first output is undefined').status).toBe('passed')
    }).pipe(Effect.runPromise))

  it('reports a coverage failure once, on the property that declared it', () =>
    Effect.gen(function*() {
      const report = yield* runFixtures(['property/coverage-once.test.ts'])
      const file = fileOf(report, 'coverage-once.test.ts')
      expect(file.status).toBe('failed')
      const messages = messagesOf(report, 'Should_NameTheCoverageShare_When_AClassIsBelowItsMinimum')
      expect(messages).toContain('singletons')
      expect(messages).toContain('below the required')
      expect(file.message).not.toContain('coverage')
    }).pipe(Effect.runPromise))

  it('passes metamorphic, roundTrip and invariant laws over correct subjects', () =>
    Effect.gen(function*() {
      const report = yield* runFixtures([LAW_KINDS])
      const passed = LAWS_THAT_HOLD.filter((name) => assertionOf(report, name).status === 'passed')
      expect(passed).toEqual([...LAWS_THAT_HOLD])
      expect(fileOf(report, 'law-kinds.test.ts').message).not.toContain('no property in this file refuted')
    }).pipe(Effect.runPromise))

  it('falsifies metamorphic, roundTrip and invariant laws with a shrunk counterexample', () =>
    Effect.gen(function*() {
      const report = yield* runFixtures([LAW_KINDS])
      const verdicts = LAWS_THAT_FALSIFY.map((name) => ({
        name,
        status: assertionOf(report, name).status,
        shrunk: messagesOf(report, name).includes('Shrunk input:'),
      }))
      expect(verdicts).toEqual(LAWS_THAT_FALSIFY.map((name) => ({ name, status: 'failed', shrunk: true })))
    }).pipe(Effect.runPromise))
})
