import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { noEitherTagAssertions } from '../no-either-tag-assertions.js'

RuleTester.it = vitest.it
RuleTester.itOnly = vitest.it.only
RuleTester.describe = vitest.describe

const TEST_FILENAME = 'file.test.ts'

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      lang: 'ts',
    },
  },
})

ruleTester.run('no-either-tag-assertions', noEitherTagAssertions, {
  valid: [
    {
      name: 'Should_Pass_When_ToBe_Value_Is_Not_Either_Tag',
      code: `expect(result._tag).toBe('SomeTag')`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Using_ToBe_With_Non_Tag_Property',
      code: `expect(result.name).toBe('foo')`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Comparing_Tag_To_Non_Either_Value',
      code: `if (result._tag === 'CustomTag') {}`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Comparing_Non_Tag_Property',
      code: `if (result.name === 'Left') {}`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Tag_Is_Second_Arg_Of_Expect',
      code: `expect(otherValue, result._tag).toBe('Left')`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Expect_Tag_ToBe_With_Chained_Method_Before_Matcher',
      code: `expect(result._tag).something.toBe('Left')`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Expect_Tag_ToBe_With_No_Arguments',
      code: `expect(result._tag).toBe()`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_ToBe_Is_A_Property_Name_Not_Matcher',
      code: `expect(result._tag).toBe.toBe('Left')`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_NonToMatchObject_Method_With_EitherTag',
      code: `expect(result).someProperty({ _tag: 'Left' })`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_NonTag_Property_ToBe_Either_Tag_Value',
      code: `expect(result.name).toBe('Left')`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Expect_Tag_ToBe_With_Regex_Not_Matching_Either',
      code: `expect(result._tag).toMatch(/Custom/)`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Expect_Tag_ToContain_Not_Matching_Either',
      code: `expect(result._tag).toContain('Custom')`,
      filename: TEST_FILENAME,
    },

    {
      name: 'Should_Pass_When_Tag_In_NonEquality_BinaryExpression',
      code: `if (result._tag < 'Left') {}`,
      filename: TEST_FILENAME,
    },

    {
      name: 'Should_Pass_When_objectContaining_Tag_Value_Is_Not_Either',
      code: `expect.objectContaining({ _tag: 'CustomTag' })`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_objectContaining_Tag_Value_Is_Not_String',
      code: `expect.objectContaining({ _tag: 42 })`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_objectContaining_No_Tag_Property',
      code: `expect.objectContaining({ message: 'error' })`,
      filename: TEST_FILENAME,
    },

    {
      name: 'Should_Pass_When_Not_In_Test_File',
      code: `expect(result._tag).toBe('Left')`,
      filename: 'src/service.ts',
    },
    {
      name: 'Should_Pass_When_In_Non_Test_Source_File',
      code: `if (result._tag === 'Left') {}`,
      filename: 'src/index.ts',
    },

    {
      name: 'Should_Pass_When_Expect_Wraps_NonEither_Namespace_Guard_ToBe_Boolean',
      code: `expect(Result.isLeft(x)).toBe(true)`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Expect_Wraps_NonIsLeftIsRight_Guard_ToBe_Boolean',
      code: `expect(Either.isBoth(x)).toBe(true)`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Expect_Wraps_NonBoolean_Literal_ToBe',
      code: `expect(Either.isLeft(x)).toBe('yes')`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Either_isLeft_Without_Expect',
      code: `Either.isLeft(result)`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Either_isRight_Without_Expect',
      code: `Either.isRight(result)`,
      filename: TEST_FILENAME,
    },

    {
      name: 'Should_Pass_When_Tag_Access_Not_In_Array_Callback_With_Non_Either_Value',
      code: `if (e._tag === 'Custom') {}`,
      filename: TEST_FILENAME,
    },

    {
      name: 'Should_Pass_When_Computed_Tag_Access_Non_Either_Value',
      code: `result['_tag'] === 'Custom'`,
      filename: TEST_FILENAME,
    },

    {
      name: 'Should_Pass_When_Unwrap_Right_Tag_Compared_To_Domain_Tag',
      code: `Either.isRight(result) && result.right._tag === 'Skip'`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Unwrap_Left_Tag_Compared_To_Domain_Tag',
      code: `if (result.left._tag === 'NetworkError') {}`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Unwrap_Right_Tag_Compared_To_Domain_Tag_Success',
      code: `if (result.right._tag === 'Success') {}`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Unwrap_Right_Tag_Bare_Read',
      code: `const tag = result.right._tag`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Unwrap_Right_Tag_Read_In_Match_Value',
      code: `Match.value(result.right._tag).pipe(Match.when('Skip', () => 1))`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Unwrap_Left_Tag_In_Non_Equality_Binary',
      code: `if (result.left._tag < 'Left') {}`,
      filename: TEST_FILENAME,
    },
    {
      name: 'Should_Pass_When_Member_Object_Is_Not_Left_Or_Right_Unwrap',
      code: `const x = result.data._tag`,
      filename: TEST_FILENAME,
    },
  ],

  invalid: [
    {
      name: 'Should_Report_When_Expect_ToBe_Left_Tag',
      code: `expect(result._tag).toBe('Left')`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'expectTagMatcher',
          data: { name: 'result._tag' },
          suggestions: [
            {
              messageId: 'expectTagMatcher',
              output: `expect(result).toEqual(Either.left(result))`,
            },
          ],
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_ToBe_Right_Tag',
      code: `expect(result._tag).toBe('Right')`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'expectTagMatcher',
          data: { name: 'result._tag' },
          suggestions: [
            {
              messageId: 'expectTagMatcher',
              output: `expect(result).toEqual(Either.right(result))`,
            },
          ],
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_ToEqual_Left_Tag',
      code: `expect(error._tag).toEqual('Left')`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'expectTagMatcher',
          data: { name: 'error._tag' },
          suggestions: [
            {
              messageId: 'expectTagMatcher',
              output: `expect(error).toEqual(Either.left(error))`,
            },
          ],
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_ToStrictEqual_Right_Tag',
      code: `expect(value._tag).toStrictEqual('Right')`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'expectTagMatcher',
          data: { name: 'value._tag' },
          suggestions: [
            {
              messageId: 'expectTagMatcher',
              output: `expect(value).toEqual(Either.right(value))`,
            },
          ],
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_Not_ToBe_Left_Tag',
      code: `expect(result._tag).not.toBe('Left')`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'expectTagMatcher',
          data: { name: 'result._tag' },
          suggestions: [
            {
              messageId: 'expectTagMatcher',
              output: `expect(result).not.toEqual(Either.left(result))`,
            },
          ],
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_ToContain_Matching_Either_Tag',
      code: `expect(result._tag).toContain('Left')`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'expectTagMatcher',
          data: { name: 'result._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_ToMatch_Matching_Either_Tag_Regex',
      code: `expect(result._tag).toMatch(/Left/)`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'expectTagMatcher',
          data: { name: 'result._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_ToMatch_Matching_Either_Tag_Regex_Right',
      code: `expect(result._tag).toMatch(/Right/)`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'expectTagMatcher',
          data: { name: 'result._tag' },
        },
      ],
    },

    {
      name: 'Should_Report_When_Comparing_Tag_With_Strict_Equality_Left',
      code: `if (result._tag === 'Left') {}`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'tagComparison',
          data: { name: 'result._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Comparing_Tag_With_Strict_Equality_Right',
      code: `if (result._tag === 'Right') {}`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'tagComparison',
          data: { name: 'result._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Comparing_Tag_With_Strict_Inequality',
      code: `if (result._tag !== 'Left') {}`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'tagComparison',
          data: { name: 'result._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Tag_Is_On_Right_Side_Of_Comparison',
      code: `if ('Left' === result._tag) {}`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'tagComparison',
          data: { name: 'result._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Comparing_Tag_With_Loose_Equality',
      code: `if (result._tag == 'Left') {}`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'tagComparison',
          data: { name: 'result._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Comparing_Tag_With_Loose_Inequality',
      code: `if (result._tag != 'Right') {}`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'tagComparison',
          data: { name: 'result._tag' },
        },
      ],
    },

    {
      name: 'Should_Report_When_objectContaining_Tag_Left',
      code: `expect.objectContaining({ _tag: 'Left' })`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'objectContainingTag',
          data: { name: '{ _tag: "Left" }' },
        },
      ],
    },
    {
      name: 'Should_Report_When_objectContaining_Tag_Right',
      code: `expect.objectContaining({ _tag: 'Right' })`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'objectContainingTag',
          data: { name: '{ _tag: "Right" }' },
        },
      ],
    },
    {
      name: 'Should_Report_When_objectContaining_Inside_Either_Left_With_Any_Tag',
      code: `expect(result).toEqual(Either.left(expect.objectContaining({ _tag: 'SomeError' })))`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'objectContainingTag',
          data: { name: '{ _tag: "SomeError" }' },
        },
      ],
    },
    {
      name: 'Should_Report_When_objectContaining_Inside_Either_Right_With_Any_Tag',
      code: `expect(result).toEqual(Either.right(expect.objectContaining({ _tag: 'Success' })))`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'objectContainingTag',
          data: { name: '{ _tag: "Success" }' },
        },
      ],
    },

    {
      name: 'Should_Report_When_Unwrap_Left_Tag_Strict_Equality_Left',
      code: `if (result.left._tag === 'Left') {}`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'unwrapTagAccess',
          data: { name: 'result.left._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Unwrap_Right_Tag_Strict_Equality_Right',
      code: `if (result.right._tag === 'Right') {}`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'unwrapTagAccess',
          data: { name: 'result.right._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Unwrap_Right_Tag_Strict_Inequality_Left',
      code: `if (result.right._tag !== 'Left') {}`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'unwrapTagAccess',
          data: { name: 'result.right._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Unwrap_Tag_Either_Literal_On_Left_Of_Comparison',
      code: `if ('Left' === result.left._tag) {}`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'unwrapTagAccess',
          data: { name: 'result.left._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Either_GetLeft_Tag',
      code: `Either.getLeft(result)._tag === 'value'`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'unwrapTagAccess',
          data: { name: 'Either.getLeft(result)._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Either_GetRight_Tag',
      code: `Either.getRight(result)._tag === 'value'`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'unwrapTagAccess',
          data: { name: 'Either.getRight(result)._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Either_GetOrThrow_Tag',
      code: `Either.getOrThrow(result)._tag === 'value'`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'unwrapTagAccess',
          data: { name: 'Either.getOrThrow(result)._tag' },
        },
      ],
    },

    {
      name: 'Should_Report_When_Expect_Wraps_Either_isLeft_ToBe_True',
      code: `expect(Either.isLeft(error)).toBe(true)`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'typeGuardAssertion',
          data: { name: 'Either.isLeft(error)' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_Wraps_Either_isRight_ToBe_False',
      code: `expect(Either.isRight(error)).toBe(false)`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'typeGuardAssertion',
          data: { name: 'Either.isRight(error)' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_Wraps_Either_isLeft_No_Arg_ToBe_True',
      code: `expect(Either.isLeft()).toBe(true)`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'typeGuardAssertion',
          data: { name: 'Either.isLeft(value)' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_Wraps_Either_isRight_No_Arg_ToBe_False',
      code: `expect(Either.isRight()).toBe(false)`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'typeGuardAssertion',
          data: { name: 'Either.isRight(value)' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_Wraps_Either_isLeft_ToBeTruthy',
      code: `expect(Either.isLeft(result)).toBeTruthy()`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'typeGuardAssertion',
          data: { name: 'Either.isLeft(result)' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Expect_Wraps_Either_isRight_ToBeFalsy',
      code: `expect(Either.isRight(result)).toBeFalsy()`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'typeGuardAssertion',
          data: { name: 'Either.isRight(result)' },
        },
      ],
    },

    {
      name: 'Should_Report_When_Switch_On_Tag_With_Left_Case',
      code: `switch (result._tag) { case 'Left': break; case 'Right': break; }`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'switchOnTag',
          data: { name: 'result._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Switch_On_Tag_With_Right_Case',
      code: `switch (result._tag) { case 'Right': break; }`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'switchOnTag',
          data: { name: 'result._tag' },
        },
      ],
    },

    {
      name: 'Should_Report_When_Computed_Tag_Access_Equals_Left',
      code: `result['_tag'] === 'Left'`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'computedTagAccess',
          data: { name: "result['_tag']" },
        },
      ],
    },
    {
      name: 'Should_Report_When_Computed_Tag_Access_Equals_Right',
      code: `result['_tag'] === 'Right'`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'computedTagAccess',
          data: { name: "result['_tag']" },
        },
      ],
    },
    {
      name: 'Should_Report_When_Computed_Tag_Access_Strict_Inequality',
      code: `result['_tag'] !== 'Left'`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'computedTagAccess',
          data: { name: "result['_tag']" },
        },
      ],
    },

    {
      name: 'Should_Report_When_Tag_Access_In_Filter_Callback',
      code: `items.filter(e => e._tag === 'Left')`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'callbackTagAccess',
          data: { name: 'e._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Tag_Access_In_Map_Callback',
      code: `items.map(e => e._tag)`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'callbackTagAccess',
          data: { name: 'e._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Tag_Access_In_Find_Callback',
      code: `items.find(e => e._tag === 'Right')`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'callbackTagAccess',
          data: { name: 'e._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Tag_Access_In_Some_Callback',
      code: `items.some(e => e._tag === 'Left')`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'callbackTagAccess',
          data: { name: 'e._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Tag_Access_In_Every_Callback',
      code: `items.every(e => e._tag === 'Right')`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'callbackTagAccess',
          data: { name: 'e._tag' },
        },
      ],
    },
    {
      name: 'Should_Report_When_Tag_Access_In_FlatMap_Callback',
      code: `items.flatMap(e => e._tag === 'Left' ? [e] : [])`,
      filename: TEST_FILENAME,
      errors: [
        {
          messageId: 'callbackTagAccess',
          data: { name: 'e._tag' },
        },
      ],
    },
  ],
})
