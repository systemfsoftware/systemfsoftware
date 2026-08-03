import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { middlewareGateFailsOnDecodeFailure } from '../middleware-gate-fails-on-decode-failure.js'

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

const data = {
  name: 'Effect.succeed(null)',
  expected: 'a decode-failure branch that produces Effect.fail — the gate short-circuits at the edge',
  actual: 'a decode-failure branch that succeeds with an Option or nullable',
  fix: 'return Effect.fail with the typed 401/403/400 error so downstream handlers never see the invalid state',
}

ruleTester.run('middleware-gate-fails-on-decode-failure', middlewareGateFailsOnDecodeFailure, {
  valid: [
    {
      name: 'Should_Pass_When_FailureBranchFails_When_MiddlewareFile',
      code:
        `const attachSession = (c, next) => { const session = decode(c); if (!session) return Effect.fail(new Unauthorized()); c.set('session', session); return next() }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_GenGateFails_When_MiddlewareFile',
      code:
        `Effect.gen(function* () { const session = decode(c.req.header('Authorization')); if (!session) { return yield* Effect.fail(new Unauthorized()) } c.set('session', session); return yield* next() })`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SucceedWithFact_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(subject) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SucceedWithOptionSome_InPresenceCheckConsequent_When_MiddlewareFile',
      code: `if (session) { return Effect.succeed(Option.some(session)) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SucceedWithNullable_InElseOfAbsenceCheck_When_MiddlewareFile',
      code: `if (!session) { return Effect.fail(new Unauthorized()) } else { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SucceedWithNullable_OutsideAnyIf_When_MiddlewareFile',
      code: `return Effect.succeed(Option.none())`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SucceedWithOptionModuleReference_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(Option) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_FailureBranchFails_WithEqualsNull_When_MiddlewareFile',
      code: `if (session == null) { return Effect.fail(new Unauthorized()) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_FailureBranchFails_WithStrictEqualsUndefined_When_MiddlewareFile',
      code: `if (session === undefined) { return Effect.fail(new Unauthorized()) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Ignore_SucceedWithNullable_When_HandlerFile',
      code: `if (!session) { return Effect.succeed(Option.none()) }`,
      filename: 'attach-session.handler.ts',
    },
    {
      name: 'Should_Ignore_SucceedWithNullable_When_ExecutorFile',
      code: `if (!session) { return Effect.succeed(null) }`,
      filename: 'attach-session.executor.ts',
    },
    {
      name: 'Should_Ignore_SucceedWithNullable_When_WorkflowFile',
      code: `if (!session) { return Effect.succeed(null) }`,
      filename: 'attach-session.workflow.ts',
    },
    {
      name: 'Should_Pass_When_SucceedWithZeroLiteral_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(0) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SucceedWithNegatedExpression_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(!session) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SucceedWrongObjectMember_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Other.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SucceedWrongPropertyMember_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.other(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SucceedTwoArguments_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(null, true) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_SucceedOptionCallWrongObject_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(Other.none(null)) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_UnaryMinusIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (-session) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_NotMemberIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session.foo) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_OptionIsNoneTwoArgs_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (Option.isNone(a, b)) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_OptionIsNoneMemberArgument_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (Option.isNone(session.foo)) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_NotEqualsNullIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (session != null) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_TypeofNumberIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (typeof session === 'number') { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_NotEqualsUndefinedIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session === 'undefined') { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_TypeofNonLiteralRightIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (typeof session === someVar) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_TypeofMemberIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (typeof session.foo === 'undefined') { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_StrictEqualsZeroIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (session === 0) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_ZeroEqualsSessionIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (0 === session) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_MemberEqualsNullIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (foo.bar === null) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_NullEqualsMemberIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (null === foo.bar) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_MemberEqualsUndefinedIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (foo.bar === undefined) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
    {
      name: 'Should_Pass_When_UndefinedEqualsMemberIfTest_InDecodeFailureBranch_When_MiddlewareFile',
      code: `if (undefined === foo.bar) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_Report_EffectSucceedNull_When_DecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data }],
    },
    {
      name: 'Should_Report_EffectSucceedUndefined_When_DecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(undefined) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data: { ...data, name: 'Effect.succeed(undefined)' } }],
    },
    {
      name: 'Should_Report_EffectSucceedVoidZero_When_DecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(void 0) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data: { ...data, name: 'Effect.succeed(void 0)' } }],
    },
    {
      name: 'Should_Report_EffectSucceedOptionNoneCall_When_DecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(Option.none()) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data: { ...data, name: 'Effect.succeed(Option.none(...))' } }],
    },
    {
      name: 'Should_Report_EffectSucceedOptionNoneValue_When_DecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(Option.none) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data: { ...data, name: 'Effect.succeed(Option.none)' } }],
    },
    {
      name: 'Should_Report_EffectSucceedOptionSome_When_DecodeFailureBranch_When_MiddlewareFile',
      code: `if (!session) { return Effect.succeed(Option.some(session)) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data: { ...data, name: 'Effect.succeed(Option.some(...))' } }],
    },
    {
      name: 'Should_Report_EffectSucceedOptionEmpty_When_EqualsNullCheck_When_MiddlewareFile',
      code: `if (session == null) { return Effect.succeed(Option.empty()) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data: { ...data, name: 'Effect.succeed(Option.empty(...))' } }],
    },
    {
      name: 'Should_Report_EffectSucceedNull_When_StrictEqualsUndefinedCheck_When_MiddlewareFile',
      code: `if (session === undefined) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data }],
    },
    {
      name: 'Should_Report_EffectSucceedUndefined_When_TypeofUndefinedCheck_When_MiddlewareFile',
      code: `if (typeof session === 'undefined') { return Effect.succeed(undefined) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data: { ...data, name: 'Effect.succeed(undefined)' } }],
    },
    {
      name: 'Should_Report_EffectSucceedNull_When_OptionIsNoneCheck_When_MiddlewareFile',
      code: `if (Option.isNone(session)) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data }],
    },
    {
      name: 'Should_Report_EffectSucceedOptionNone_When_NestedInsideFailureBranch_When_MiddlewareFile',
      code: `if (!session) { if (retry < 3) { return Effect.succeed(Option.none()) } }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data: { ...data, name: 'Effect.succeed(Option.none(...))' } }],
    },
    {
      name: 'Should_Report_EffectSucceedOptionNone_When_GenYieldStar_When_MiddlewareFile',
      code:
        `Effect.gen(function* () { if (!session) { return yield* Effect.succeed(Option.none()) } return yield* next() })`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data: { ...data, name: 'Effect.succeed(Option.none(...))' } }],
    },
    {
      name: 'Should_Report_EffectSucceedNull_When_NullEqualsSession_When_MiddlewareFile',
      code: `if (null === session) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data }],
    },
    {
      name: 'Should_Report_EffectSucceedUndefined_When_UndefinedEqualsSession_When_MiddlewareFile',
      code: `if (undefined === session) { return Effect.succeed(undefined) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data: { ...data, name: 'Effect.succeed(undefined)' } }],
    },
    {
      name: 'Should_Report_EffectSucceedNull_When_TypeofUndefinedOnLeft_When_MiddlewareFile',
      code: `if ('undefined' === typeof session) { return Effect.succeed(null) }`,
      filename: 'attach-session.middleware.ts',
      errors: [{ messageId: 'gateFail', data }],
    },
  ],
})
