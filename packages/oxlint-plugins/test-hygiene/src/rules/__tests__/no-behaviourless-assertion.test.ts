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
    {
      // Pins the `node.computed !== true` guard at dependsOnBehaviour line 38:
      // a computed MemberExpression with a locally-bound property key must
      // report behavior via the computed key. The original guard skips only
      // non-computed property names; a mutant that flips `!==` to `===` or
      // replaces the guard with `true` would skip the computed key too and
      // miss this local binding.
      name: 'Should_Pass_When_TheSubjectIsAComputedAccessWithLocalKey',
      filename,
      code: `${imports}const key = 'length'\nexpect(CEILING_MS[key]).toBe(4)`,
    },
    {
      // Pins the `.some` → `.every` mutant at dependsOnBehaviour line 25: a
      // mixed array of imported and locally-bound identifiers must report
      // `.some` true (behavior present) but `.every` false (not all
      // elements are behavior). The subject array literal contains one
      // imported constant and one local call result.
      name: 'Should_Pass_When_TheExpectationArrayMixesImportedAndLocalBindings',
      filename,
      code: `${imports}expect(CEILING_MS).toBe([resolve(1), STEP_MS])`,
    },
    {
      // Pins the `target.callee.name !== EXPECT` guard at expectCallOf line 49
      // col 46: an inner call whose callee is an Identifier with a name other
      // than 'expect' must not be treated as an expect call. The original
      // returns undefined for non-'expect' identifiers; the mutant flips the
      // check and would proceed to process the call as if it were expect.
      name: 'Should_Pass_When_TheInnerCallIsNotAnExpectCall',
      filename,
      code: `${imports}assert(CEILING_MS).toBe(STEP_MS)`,
    },
    {
      // Pins the `target.callee.type !== 'Identifier'` guard at expectCallOf
      // line 49 col 7: an inner call whose callee is a MemberExpression must
      // not be treated as an expect call. The original returns undefined for
      // non-Identifier callees; the mutant flips the check and would proceed.
      name: 'Should_Pass_When_TheInnerCallCalleeIsAMemberExpression',
      filename,
      code: `${imports}foo.bar(CEILING_MS).toBe(STEP_MS)`,
    },
    {
      // Pins the `subject === undefined` guard at the visitor line 73: an
      // expect() call with no arguments must not crash and must not be
      // reported. The original returns early when subject is undefined; the
      // mutant removes the guard and processes undefined, which has no
      // behavior, so the rule would report.
      name: 'Should_Pass_When_ExpectIsCalledWithNoArguments',
      filename,
      code: `${imports}expect().toBe(CEILING_MS)`,
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
