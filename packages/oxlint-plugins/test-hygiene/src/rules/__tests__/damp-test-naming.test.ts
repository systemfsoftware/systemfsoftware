import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'
import { dampTestNaming } from '../damp-test-naming.js'

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

ruleTester.run('damp-test-naming', dampTestNaming, {
  valid: [
    {
      name: 'Should_Pass_When_TestNameFollowsDAMPFormat',
      code: `
        it('Should_ThrowError_When_PasswordInvalid', () => {})
        test('Should_CreateUser_When_InputValid', () => {})
        it('Should_ReturnSuccess_When_CredentialsAreValid', () => {})
      `,
    },
    {
      name: 'Should_Pass_When_BehaviorAndConditionHaveNumbers',
      code: `it('Should_ParseJson123_When_InputValid456', () => {})`,
    },
    {
      name: 'Should_Pass_When_UsingItEffectOrTestOnly',
      code: `
        it.effect('Should_ProcessPayload_When_Valid', () => {})
        test.only('Should_UpdateRecord_When_DataExists', () => {})
      `,
    },
    {
      name: 'Should_Ignore_When_NonTestFunctionCalled',
      code: `
        const processData = (name: string) => {}
        processData('test name')
        myFunction('should not trigger')
      `,
    },
    {
      name: 'Should_Ignore_When_InDescribeBlock',
      code: `
        describe('Any format allowed here', () => {
          it('Should_Work_When_Called', () => {})
        })
      `,
    },
    {
      name: 'Should_Ignore_When_DescribeBlockHasTestPrefix',
      code: `describe('testLogin functionality', () => {})`,
    },
    {
      name: 'Should_Ignore_When_DescribeBlockHasInvalidFormat',
      code: `describe('Should_ButNoWhen', () => {})`,
    },
    {
      name: 'Should_Ignore_When_NoTestNameProvided',
      code: `it()`,
    },
    {
      name: 'Should_Ignore_When_TestNameIsVariable',
      code: `
        const name = 'Should_Work_When_Called'
        it(name, () => {})
      `,
    },
    {
      name: 'Should_Pass_When_TestNameIsTemplateLiteral',
      code: `it(\`Should_Work_When_Called\`, () => {})`,
    },
    {
      name: 'Should_Ignore_When_NonTestCallee',
      code: `
        const obj = { method: (name: string, fn: () => void) => {} }
        obj.method('invalid name', () => {})
      `,
    },
    {
      name: 'Should_Ignore_When_ComputedMemberExpression',
      code: `
        const methods: Record<string, (name: string, fn: () => void) => void> = {}
        methods['test'].only('invalid name', () => {})
      `,
    },
    {
      name: 'Should_Ignore_When_CallExpressionAsCalleeObject',
      code: `
        const getIt = () => ({ only: (name: string, fn: () => void) => {} })
        getIt().only('invalid name', () => {})
      `,
    },
    {
      name: 'Should_Pass_When_DeeplyNestedMemberExpression',
      code: `it.effect.only('Should_Work_When_Called', () => {})`,
    },
    {
      name: 'Should_Pass_When_BehaviorHasOnlyTwoCharacters',
      code: `it('Should_Go_When_Called', () => {})`,
    },
    {
      name: 'Should_Pass_When_ConditionHasOnlyTwoCharacters',
      code: `it('Should_Work_When_Ok', () => {})`,
    },
    {
      name: 'Should_Ignore_When_TemplateLiteralHasExpressions',
      code: `
        const suffix = 'Called'
        it(\`Should_Work_When_\${suffix}\`, () => {})
      `,
    },
    {
      name: 'Should_Ignore_When_ItProp_EvenWithDAMPName',
      code: `it.prop('Should_Throw_When_Invalid', [Schema.String], ([s]) => s.length > 0)`,
    },
    {
      name: 'Should_Ignore_When_ItEffectProp_EvenWithDAMPName',
      code: `it.effect.prop('Should_Reject_When_ExceedsWindow', [Schema.Number], ([n]) => n > 0)`,
    },
    {
      name: 'Should_Ignore_When_ItPropOnly_Called',
      code: `it.prop.only('Should_Throw_When_Invalid', [Schema.String], ([s]) => s.length > 0)`,
    },
    {
      name: 'Should_Ignore_When_ItEffectPropOnly_Called',
      code: `it.effect.prop.only('Should_Reject_When_ExceedsWindow', [Schema.Number], ([n]) => n > 0)`,
    },
  ],
  invalid: [
    {
      name: 'Should_ReportTestPrefixError_When_LowercaseTestPrefix',
      code: `test('testLogin', () => {})`,
      errors: [
        {
          messageId: 'testPrefixForbidden',
          data: {
            expected: 'DAMP format starting with Should_',
            actual: 'Test starts with "test" prefix',
            fix: 'Remove "test" prefix and use DAMP format: Should_[Behavior]_When_[Condition]',
          },
        },
      ],
    },
    {
      name: 'Should_ReportMissingShould_When_NoShouldPrefix',
      code: `it('works correctly', () => {})`,
      errors: [
        {
          messageId: 'missingShouldPrefix',
          data: {
            expected: 'Test name starting with Should_',
            actual: 'Test name "works correctly" missing Should_ prefix',
            fix: 'Add "Should_" prefix to test name',
          },
        },
      ],
    },
    {
      name: 'Should_ReportMissingWhen_When_NoWhenSeparator',
      code: `it('Should_WorkCorrectly', () => {})`,
      errors: [
        {
          messageId: 'missingWhenSeparator',
          data: {
            expected: 'Should_[Behavior]_When_[Condition] format',
            actual: 'Test name "Should_WorkCorrectly" missing _When_ separator',
            fix: 'Insert "_When_" separator between behavior and condition',
          },
        },
      ],
    },
    {
      name: 'Should_ReportEmptyBehavior_When_NothingBetweenShouldAndWhen',
      code: `it('Should__When_Called', () => {})`,
      errors: [
        {
          messageId: 'emptyBehavior',
          data: {
            expected: 'Non-empty behavior in PascalCase (e.g., ThrowError)',
            actual: 'Empty string between Should_ and _When_',
            fix: 'Add descriptive behavior between Should_ and _When_ (e.g., Should_ThrowError_When_Called)',
          },
        },
      ],
    },
    {
      name: 'Should_ReportEmptyCondition_When_NothingAfterWhen',
      code: `it('Should_ThrowError_When_', () => {})`,
      errors: [
        {
          messageId: 'emptyCondition',
          data: {
            expected: 'Non-empty condition in PascalCase (e.g., PasswordInvalid)',
            actual: 'Empty string after _When_',
            fix: 'Add descriptive condition after _When_ (e.g., Should_ThrowError_When_PasswordInvalid)',
          },
        },
      ],
    },
    {
      name: 'Should_ReportInvalidBehaviorCase_When_NotPascalCase',
      code: `it('Should_throwError_When_Called', () => {})`,
      errors: [
        {
          messageId: 'invalidBehaviorCase',
          data: {
            expected: 'PascalCase (e.g., ThrowError)',
            actual: 'Behavior "throwError" is not PascalCase',
            fix: 'Convert behavior to PascalCase (e.g., throwError → ThrowError)',
          },
        },
      ],
    },
    {
      name: 'Should_ReportInvalidConditionCase_When_NotPascalCase',
      code: `it('Should_Throw_When_passwordInvalid', () => {})`,
      errors: [
        {
          messageId: 'invalidConditionCase',
          data: {
            expected: 'PascalCase (e.g., PasswordInvalid)',
            actual: 'Condition "passwordInvalid" is not PascalCase',
            fix: 'Convert condition to PascalCase (e.g., passwordInvalid → PasswordInvalid)',
          },
        },
      ],
    },
    {
      name: 'Should_ReportTestPrefixError_When_UppercaseTestPrefix',
      code: `test('TestLogin', () => {})`,
      errors: [
        {
          messageId: 'testPrefixForbidden',
          data: {
            expected: 'DAMP format starting with Should_',
            actual: 'Test starts with "Test" prefix',
            fix: 'Remove "test" prefix and use DAMP format: Should_[Behavior]_When_[Condition]',
          },
        },
      ],
    },
    {
      name: 'Should_ReportMissingShould_When_ShouldWithoutUnderscore',
      code: `it('ShouldWorkCorrectly', () => {})`,
      errors: [{ messageId: 'missingShouldPrefix' }],
    },
    {
      name: 'Should_ReportInvalidBehaviorCase_When_AllUppercase',
      code: `it('Should_THROW_When_Called', () => {})`,
      errors: [{ messageId: 'invalidBehaviorCase' }],
    },
    {
      name: 'Should_ReportInvalidConditionCase_When_AllUppercase',
      code: `it('Should_Throw_When_CALLED', () => {})`,
      errors: [{ messageId: 'invalidConditionCase' }],
    },
    {
      name: 'Should_ReportMultipleErrors_When_MultipleInvalidTests',
      code: `
        it.effect('should work', () => {})
        test.only('Should_Throw_When_', () => {})
      `,
      errors: [
        { messageId: 'missingShouldPrefix' },
        { messageId: 'emptyCondition' },
      ],
    },
    {
      name: 'Should_Report_When_SingleLetterBehavior',
      code: `it('Should_a_When_Called', () => {})`,
      errors: [{ messageId: 'invalidBehaviorCase' }],
    },
    {
      name: 'Should_Report_When_TemplateLiteralHasInvalidName',
      code: `it(\`works correctly\`, () => {})`,
      errors: [{ messageId: 'missingShouldPrefix' }],
    },
    {
      name: 'Should_Report_When_DeeplyNestedMemberExpressionHasInvalidName',
      code: `it.effect.only('works correctly', () => {})`,
      errors: [{ messageId: 'missingShouldPrefix' }],
    },
    {
      name: 'Should_Report_When_BehaviorHasSpecialCharacters',
      code: `it('Should_Throw!Error_When_Called', () => {})`,
      errors: [{ messageId: 'invalidBehaviorCase' }],
    },
    {
      name: 'Should_Report_When_ConditionHasSpecialCharacters',
      code: `it('Should_Throw_When_Called!Now', () => {})`,
      errors: [{ messageId: 'invalidConditionCase' }],
    },
  ],
})
