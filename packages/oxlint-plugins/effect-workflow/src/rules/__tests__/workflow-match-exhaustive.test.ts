import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowMatchExhaustive } from '../workflow-match-exhaustive.js'

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

ruleTester.run('workflow-match-exhaustive', workflowMatchExhaustive, {
  valid: [
    {
      name: 'Should_Ignore_When_FileIsExecutor',
      code: `const x = Match.value(input).pipe(Match.tag('A', () => {}), Match.orElse(() => {}))`,
      filename: 'cancel-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_OpenBooleanRecordUsesOrElse',
      code: `const result = Match.value(input).pipe(
        Match.when({ isAdmin: true }, () => open),
        Match.when({ isGated: true, isSubscribed: false }, () => gated),
        Match.orElse(() => open)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TagChainEndsWithExhaustive',
      code: `const result = Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.tag('B', () => b),
        Match.exhaustive
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_WhenChainHasNoTerminator',
      code: `const result = Match.value(input).pipe(
        Match.when({ active: true }, () => active),
        Match.when({ active: false }, () => inactive)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_NonMatchOrElseTerminator',
      code: `const result = Match.value(input).pipe(
        Match.when({ active: true }, () => active),
        Other.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_PipeIsOnNonMatchValue',
      code: `const result = notMatch.value(input).pipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ValueMethodNameMismatch',
      code: `const result = Match.notValue(input).pipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_CalledExhaustiveTerminator',
      code: `const result = Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.exhaustive()
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_PipeHasDifferentPropertyName',
      code: `const result = Match.value(input).notPipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ValueAccessIsComputed',
      code: `const result = Match['value'](input).pipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ValueObjectIsNotIdentifier',
      code: `const result = Other.Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_ComputedPipeAccess',
      code: `const result = Match.value(input)['pipe'](
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_CalleeIsNotMemberExpression',
      code: `someFn(Match.tag('A', () => a), Match.orElse(() => fallback))`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_PipeObjectIsNotCallExpression',
      code: `const result = foo.pipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_TagReferenceIsNotATagArm',
      code: `const result = Match.value(input).pipe(
        Match.tag,
        Match.exhaustive
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_NonMatchTagCall',
      code: `const result = Match.value(input).pipe(
        Other.Match.tag('A', () => a),
        Match.exhaustive
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_RecordArmSurvivorPrecedesPredicateArm',
      code: `const result = Match.value({ hasReference, hasDelegation }).pipe(
        Match.when({ hasReference: true }, () => referenced),
        Match.when({ hasDelegation: false }, () => none),
        Match.orElse(() => delegated)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_PipeHasNoArguments',
      code: `const result = Match.value(input).pipe()`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_OrElseNamespaceIsNotMatch',
      code: `const result = Match.value(input).pipe(
        Other.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_ReportOrElse_When_TagChainEndsWithOrElse',
      code: `const result = Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.tag('B', () => b),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'orElseOnClosedUnion',
          data: {
            name: 'Match.orElse',
            expected: 'Match.exhaustive',
            actual: 'Match.orElse over a closed tagged union',
            fix: 'replace Match.orElse with Match.exhaustive and add an arm per tag, so a new variant fails to compile',
          },
        },
      ],
    },
    {
      name: 'Should_ReportMissing_When_TagChainHasNoTerminator',
      code: `const result = Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.tag('B', () => b)
      )`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'missingExhaustive',
          data: {
            name: 'Match.value(...).pipe(...)',
            expected: 'a Match.exhaustive terminator',
            actual: 'a tag dispatch with no exhaustiveness terminator',
            fix: 'end the pipe with Match.exhaustive',
          },
        },
      ],
    },
    {
      name: 'Should_ReportOrElse_When_TagAndWhenMixEndsWithOrElse',
      code: `const result = Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.when({ active: true }, () => active),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'orElseOnClosedUnion',
          data: {
            name: 'Match.orElse',
            expected: 'Match.exhaustive',
            actual: 'Match.orElse over a closed tagged union',
            fix: 'replace Match.orElse with Match.exhaustive and add an arm per tag, so a new variant fails to compile',
          },
        },
      ],
    },
    {
      name: 'Should_ReportOrElse_When_TagChainEndsWithOrElseReference',
      code: `const result = Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.orElse
      )`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'orElseOnClosedUnion',
          data: {
            name: 'Match.orElse',
            expected: 'Match.exhaustive',
            actual: 'Match.orElse over a closed tagged union',
            fix: 'replace Match.orElse with Match.exhaustive and add an arm per tag, so a new variant fails to compile',
          },
        },
      ],
    },
    {
      name: 'Should_ReportMissing_When_TagChainEndsWithOtherCall',
      code: `const result = Match.value(input).pipe(
        Match.tag('A', () => a),
        someOtherFn()
      )`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'missingExhaustive',
          data: {
            name: 'Match.value(...).pipe(...)',
            expected: 'a Match.exhaustive terminator',
            actual: 'a tag dispatch with no exhaustiveness terminator',
            fix: 'end the pipe with Match.exhaustive',
          },
        },
      ],
    },
    {
      name: 'Should_ReportMissing_When_TagChainEndsWithLiteral',
      code: `const result = Match.value(input).pipe(
        Match.tag('A', () => a),
        'trailing'
      )`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'missingExhaustive',
          data: {
            name: 'Match.value(...).pipe(...)',
            expected: 'a Match.exhaustive terminator',
            actual: 'a tag dispatch with no exhaustiveness terminator',
            fix: 'end the pipe with Match.exhaustive',
          },
        },
      ],
    },
    {
      name: 'Should_ReportOpenDispatch_When_PredicateArmEndsWithOrElse',
      code: `const result = Match.value(cmd.text).pipe(
        Match.when(opensWithSigil, () => host),
        Match.orElse(() => model)
      )`,
      filename: 'prompt-destination.workflow.ts',
      errors: [
        {
          messageId: 'orElseOnOpenDispatch',
          data: {
            name: 'Match.orElse',
            expected: 'Match.tag arms closed by Match.exhaustive',
            actual: 'Match.orElse as the fallback of a predicate or literal dispatch over an open type',
            fix:
              'derive a closed variant first with a total constructor (Option.fromNullable, a tagged union), then dispatch with Match.tag and Match.exhaustive',
          },
        },
      ],
    },
    {
      name: 'Should_ReportOpenDispatch_When_LiteralArmsEndWithOrElse',
      code: `const result = Match.value(result.code).pipe(
        Match.when(2, () => block),
        Match.when(0, () => zero),
        Match.orElse(() => other)
      )`,
      filename: 'hook-verdict.workflow.ts',
      errors: [
        {
          messageId: 'orElseOnOpenDispatch',
          data: {
            name: 'Match.orElse',
            expected: 'Match.tag arms closed by Match.exhaustive',
            actual: 'Match.orElse as the fallback of a predicate or literal dispatch over an open type',
            fix:
              'derive a closed variant first with a total constructor (Option.fromNullable, a tagged union), then dispatch with Match.tag and Match.exhaustive',
          },
        },
      ],
    },
    {
      name: 'Should_ReportOpenDispatch_When_OrElseIsTheOnlyArm',
      code: `const result = Match.value(input).pipe(
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'orElseOnOpenDispatch',
          data: {
            name: 'Match.orElse',
            expected: 'Match.tag arms closed by Match.exhaustive',
            actual: 'Match.orElse as the fallback of a predicate or literal dispatch over an open type',
            fix:
              'derive a closed variant first with a total constructor (Option.fromNullable, a tagged union), then dispatch with Match.tag and Match.exhaustive',
          },
        },
      ],
    },
    {
      name: 'Should_ReportOpenDispatch_When_BareTagReferencePrecedesOrElse',
      code: `const result = Match.value(input).pipe(
        Match.tag,
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'orElseOnOpenDispatch',
          data: {
            name: 'Match.orElse',
            expected: 'Match.tag arms closed by Match.exhaustive',
            actual: 'Match.orElse as the fallback of a predicate or literal dispatch over an open type',
            fix:
              'derive a closed variant first with a total constructor (Option.fromNullable, a tagged union), then dispatch with Match.tag and Match.exhaustive',
          },
        },
      ],
    },
    {
      name: 'Should_ReportOpenDispatch_When_ArmCalleeIsNotAMemberExpression',
      code: `const result = Match.value(input).pipe(
        someFn({ active: true }),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'orElseOnOpenDispatch',
          data: {
            name: 'Match.orElse',
            expected: 'Match.tag arms closed by Match.exhaustive',
            actual: 'Match.orElse as the fallback of a predicate or literal dispatch over an open type',
            fix:
              'derive a closed variant first with a total constructor (Option.fromNullable, a tagged union), then dispatch with Match.tag and Match.exhaustive',
          },
        },
      ],
    },
    {
      name: 'Should_ReportOpenDispatch_When_RecordArmNamespaceIsNotMatch',
      code: `const result = Match.value(input).pipe(
        Other.when({ active: true }, () => active),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'orElseOnOpenDispatch',
          data: {
            name: 'Match.orElse',
            expected: 'Match.tag arms closed by Match.exhaustive',
            actual: 'Match.orElse as the fallback of a predicate or literal dispatch over an open type',
            fix:
              'derive a closed variant first with a total constructor (Option.fromNullable, a tagged union), then dispatch with Match.tag and Match.exhaustive',
          },
        },
      ],
    },
    {
      name: 'Should_ReportOpenDispatch_When_RecordArmMethodIsNotWhen',
      code: `const result = Match.value(input).pipe(
        Match.notWhen({ active: true }, () => active),
        Match.orElse(() => fallback)
      )`,
      filename: 'cancel-order.workflow.ts',
      errors: [
        {
          messageId: 'orElseOnOpenDispatch',
          data: {
            name: 'Match.orElse',
            expected: 'Match.tag arms closed by Match.exhaustive',
            actual: 'Match.orElse as the fallback of a predicate or literal dispatch over an open type',
            fix:
              'derive a closed variant first with a total constructor (Option.fromNullable, a tagged union), then dispatch with Match.tag and Match.exhaustive',
          },
        },
      ],
    },
  ],
})
