import { expect } from '@effect/vitest'
import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import * as Layer from 'effect/Layer'
import { assertionOf, fileOf, type JsonReport, messagesOf, namesOf, runFixtures } from './__fixtures__/run-fixtures'

const Feature = makeFeature({ it })

const CHEATS = ['cheats/property-shape.property.test.ts']
const LAW_KINDS = 'property/law-kinds.test.ts'
const VACUOUS = 'no property in this file refuted'

const GENUINE = '∀xs_KeepsEveryElement_⊆Input'
const IMPOSTOR = '∀xs_BuggySortIsStable_⊆Input'
const INVALID_BUDGET = '∀xs_InvalidBudget_⊥Accepted'
const NON_BOOLEAN = '∀xs_NonBooleanVerdict_⊥Accepted'
const COVERAGE = '∀xs_SingletonCoverage_⊇Minimum'

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

const expectCheatFileRefused = (report: JsonReport): void => {
  expect(report.numTotalTests).toBeGreaterThan(0)
  const file = fileOf(report, 'property-shape.property.test.ts')
  expect(file.status).toBe('failed')
  expect(file.message).toContain(VACUOUS)
}

const expectRefusal = (report: JsonReport, fullName: string, needle: string): void => {
  expect(messagesOf(report, fullName)).toContain(needle)
  expect(report.numFailedTests).toBeGreaterThan(0)
}

Feature('Judging a property suite')
  .live(
    'each scenario starts a nested Vitest run over probe fixtures, whose file reads the simulation kernel cannot observe',
  )
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A genuine property passes while the constant-impostor cheat is refused',
      Gherkin.Do.pipe(
        Given('the corpus of property suites a runner must judge')('report', () => runFixtures(CHEATS)),
        Then('the genuine property passed, the impostor file is refused, and both are named')((s) => {
          expect(assertionOf(s.report, GENUINE).status).toBe('passed')
          expectCheatFileRefused(s.report)
          expect(namesOf(s.report)).toContain(IMPOSTOR)
        }),
      ),
    )

    scenario(
      'The model law is reported as a pinned property',
      Gherkin.Do.pipe(
        Given('the corpus of property suites a runner must judge')('report', () => runFixtures(CHEATS)),
        Then('the corpus holds exactly one file and it is refused for refuting no property')((s) => {
          expect(CHEATS.length).toBe(1)
          expectCheatFileRefused(s.report)
        }),
      ),
    )

    scenario(
      'A budget that is not a positive count is refused, naming the configuration key',
      Gherkin.Do.pipe(
        Given('the corpus of property suites a runner must judge')('report', () => runFixtures(CHEATS)),
        Then('the invalid budget is refused with the positive-integer rewrite')((s) => {
          expectRefusal(s.report, INVALID_BUDGET, 'positive integer `runs`')
        }),
      ),
    )

    scenario(
      'A verdict that is not a boolean on the sync lane is refused',
      Gherkin.Do.pipe(
        Given('the corpus of property suites a runner must judge')('report', () => runFixtures(CHEATS)),
        Then('the non-boolean verdict is refused with the no-boolean rewrite')((s) => {
          expectRefusal(s.report, NON_BOOLEAN, 'no boolean')
        }),
      ),
    )

    scenario(
      'A coverage class below its minimum is refused, naming the label and its share',
      Gherkin.Do.pipe(
        Given('the corpus of property suites a runner must judge')('report', () => runFixtures(CHEATS)),
        Then('the uncovered class is named in the refusal')((s) => {
          expectRefusal(s.report, COVERAGE, 'singletons')
        }),
      ),
    )

    scenario(
      'A subject whose first output is undefined still passes the impostor check',
      Gherkin.Do.pipe(
        Given('a property over a subject that answers undefined once')(
          'report',
          () => runFixtures(['property/undefined-output.property.test.ts']),
        ),
        Then('the file passes and the property is judged genuine')((s) => {
          expect(fileOf(s.report, 'undefined-output.property.test.ts').status).toBe('passed')
          expect(assertionOf(s.report, '∀x_UndefinedFirstOutput_≠Impostor').status).toBe('passed')
        }),
      ),
    )

    scenario(
      'A coverage failure is reported once, on the property that declared it',
      Gherkin.Do.pipe(
        Given('a property whose declared coverage class is never reached')(
          'report',
          () => runFixtures(['property/coverage-once.property.test.ts']),
        ),
        Then('the property carries the share and the file carries no coverage message of its own')((s) => {
          const file = fileOf(s.report, 'coverage-once.property.test.ts')
          expect(file.status).toBe('failed')
          const messages = messagesOf(s.report, '∀xs_CoverageShareNamed_≠Twice')
          expect(messages).toContain('singletons')
          expect(messages).toContain('below the required')
          expect(file.message).not.toContain('coverage')
        }),
      ),
    )

    scenario(
      'Metamorphic, round-trip and invariant laws hold over correct subjects',
      Gherkin.Do.pipe(
        Given('one suite per law kind, each over a correct subject')(
          'report',
          () => runFixtures([LAW_KINDS]),
        ),
        Then('every law passes and the file is not refused')((s) => {
          const passed = LAWS_THAT_HOLD.filter((name) => assertionOf(s.report, name).status === 'passed')
          expect(passed).toEqual([...LAWS_THAT_HOLD])
          expect(fileOf(s.report, 'law-kinds.test.ts').message).not.toContain(VACUOUS)
        }),
      ),
    )

    scenario(
      'The same laws are falsified with a shrunk counterexample',
      Gherkin.Do.pipe(
        Given('the same suite of law kinds, each over an incorrect subject')(
          'report',
          () => runFixtures([LAW_KINDS]),
        ),
        Then('every law is falsified and every failure carries a shrunk input')((s) => {
          const verdicts = LAWS_THAT_FALSIFY.map((name) => ({
            name,
            status: assertionOf(s.report, name).status,
            shrunk: messagesOf(s.report, name).includes('Shrunk input:'),
          }))
          expect(verdicts).toEqual(LAWS_THAT_FALSIFY.map((name) => ({ name, status: 'failed', shrunk: true })))
        }),
      ),
    )
  })
