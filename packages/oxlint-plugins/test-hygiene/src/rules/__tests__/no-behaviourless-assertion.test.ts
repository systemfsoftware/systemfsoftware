import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { noBehaviourlessAssertion } from '../no-behaviourless-assertion.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

const filename = 'src/subject.workflow.property.test.ts'
const imports = "import { CEILING_MS, STEP_MS, resolve } from './subject.workflow.js'\n"

ruleTester.run('no-behaviourless-assertion', noBehaviourlessAssertion, {
  valid: [
    {
      name: 'Should_Pass_When_TheSubjectIsACallToTheCodeUnderTest',
      filename,
      code: `${imports}expect(resolve(600)).toBe(CEILING_MS)`,
    },
    {
      name: 'Should_Pass_When_TheSubjectIsALocallyBoundCallResult',
      filename,
      code: `${imports}const budget = resolve(600)\nexpect(budget.timeoutMs).toBe(30_000)`,
    },
    {
      name: 'Should_Pass_When_TheExpectationIsComputed',
      filename,
      code: `${imports}expect(CEILING_MS).toBe(resolve(600))`,
    },
    {
      name: 'Should_Pass_When_ANegatedAssertionInvokesTheSubject',
      filename,
      code: `${imports}expect(resolve(1)).not.toBe(CEILING_MS)`,
    },
    {
      name: 'Should_Pass_When_TheFileIsNotATest',
      filename: 'src/subject.workflow.ts',
      code: `${imports}expect(CEILING_MS).toBe(STEP_MS * 4)`,
    },
  ],
  invalid: [
    {
      name: 'Should_Fail_When_ConstantsAreComparedToEachOther',
      filename,
      code: `${imports}expect(CEILING_MS + STEP_MS).toBeLessThanOrEqual(CEILING_MS)`,
      errors: [{ messageId: 'behaviourlessAssertion' }],
    },
    {
      name: 'Should_Fail_When_AConstantIsPinnedToALiteral',
      filename,
      code: `${imports}expect(CEILING_MS).toBe(30_000)`,
      errors: [{ messageId: 'behaviourlessAssertion' }],
    },
    {
      name: 'Should_Fail_When_LiteralsAreComparedToLiterals',
      filename,
      code: `${imports}expect(2 + 2).toBe(4)`,
      errors: [{ messageId: 'behaviourlessAssertion' }],
    },
    {
      name: 'Should_Fail_When_AConstantIsAssertedThroughANegation',
      filename,
      code: `${imports}expect(CEILING_MS).not.toBe(STEP_MS)`,
      errors: [{ messageId: 'behaviourlessAssertion' }],
    },
    {
      name: 'Should_Fail_When_AConstantFieldIsPinnedToALiteral',
      filename,
      code: `${imports}expect(CEILING_MS.length).toBe(4)`,
      errors: [{ messageId: 'behaviourlessAssertion' }],
    },
  ],
})
