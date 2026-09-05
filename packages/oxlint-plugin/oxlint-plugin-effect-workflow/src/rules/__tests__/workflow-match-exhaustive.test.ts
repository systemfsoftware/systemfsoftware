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

/**
 * The fixture spine: every dispatch under test lives inside a `Workflow.make`
 * body, the boundary the rule now keys on. Suffix fixtures are gone; scope
 * cases prove the complement stays silent.
 */
const MAKE_IMPORTS = `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
`

const inMakeBody = (body: string): string =>
  `${MAKE_IMPORTS}export const decision = Workflow.make((input: unknown): Result.Result<string, never> => ${body})`

/**
 * The two-argument spine: the command schema class occupies slot 0 and the
 * decider slot 1. Every fixture built here proves the boundary is still found
 * after the decider moved — a locator that resolves only slot 0 finds a class,
 * yields no body, and this rule goes silently dark.
 */
const inTwoArgMakeBody = (body: string): string =>
  `${MAKE_IMPORTS}import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}

export const decision = Workflow.make(Cmd, (input: Cmd): Result.Result<string, never> => ${body})`

const NORELSE_ON_CLOSED = {
  name: 'Match.orElse',
  expected: 'Match.exhaustive',
  actual: 'Match.orElse over a closed tagged union',
  fix: 'replace Match.orElse with Match.exhaustive and add an arm per tag, so a new variant fails to compile',
}

const OR_ELSE_ON_OPEN = {
  name: 'Match.orElse',
  expected: 'Match.tag arms closed by Match.exhaustive',
  actual: 'Match.orElse as the fallback of a predicate or literal dispatch over an open type',
  fix:
    'derive a closed variant first with a total constructor (Option.fromNullable, a tagged union), then dispatch with Match.tag and Match.exhaustive',
}

const MISSING_EXHAUSTIVE = {
  name: 'Match.value(...).pipe(...)',
  expected: 'a Match.exhaustive terminator',
  actual: 'a tag dispatch with no exhaustiveness terminator',
  fix: 'end the pipe with Match.exhaustive',
}

ruleTester.run('workflow-match-exhaustive', workflowMatchExhaustive, {
  valid: [
    {
      name: 'Should_Ignore_TheSameViolatingDispatch_Outside_EveryMakeBoundary',
      code: `import * as Match from 'effect/Match'

const result = Match.value(input).pipe(
  Match.tag('A', () => a),
  Match.orElse(() => fallback)
)

export { result }`,
    },
    {
      name: 'Should_Ignore_When_TheBoundaryIsShadowed',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'

const Workflow = { make: (f: unknown) => f }
Workflow.make((input: unknown) =>
  Match.value(input).pipe(
    Match.tag('A', () => a),
    Match.orElse(() => b)
  ))`,
    },
    {
      name: 'Should_Ignore_When_FileImportsAnotherModuleWorkflow',
      code: `import { Workflow } from 'some-other-package'
import * as Match from 'effect/Match'

Workflow.make((input: unknown) =>
  Match.value(input).pipe(
    Match.tag('A', () => a),
    Match.orElse(() => b)
  ))`,
    },
    {
      name: 'Should_Pass_When_OpenBooleanRecordUsesOrElse',
      code: inMakeBody(`Match.value(input).pipe(
        Match.when({ isAdmin: true }, () => open),
        Match.when({ isGated: true, isSubscribed: false }, () => gated),
        Match.orElse(() => open)
      )`),
      filename: 'cancel-order.executor.ts',
    },
    {
      name: 'Should_Pass_When_TagChainEndsWithExhaustive',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.tag('B', () => b),
        Match.exhaustive
      )`),
      filename: 'cancel-order.workflow.ts',
    },
    {
      name: 'Should_Pass_When_WhenUsingRecordChainHasNoTerminator',
      code: inMakeBody(`Match.value(input).pipe(
        Match.when({ active: true }, () => active),
        Match.when({ active: false }, () => inactive)
      )`),
    },
    {
      name: 'Should_Pass_When_NonMatchOrElseTerminator',
      code: inMakeBody(`Match.value(input).pipe(
        Match.when({ active: true }, () => active),
        Other.orElse(() => fallback)
      )`),
    },
    {
      name: 'Should_Pass_When_PipeIsOnNonMatchValue',
      code: inMakeBody(`notMatch.value(input).pipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`),
    },
    {
      name: 'Should_Pass_When_ValueMethodNameMismatch',
      code: inMakeBody(`Match.notValue(input).pipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`),
    },
    {
      name: 'Should_Pass_When_CalledExhaustiveTerminator',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.exhaustive()
      )`),
    },
    {
      name: 'Should_Pass_When_PipeHasDifferentPropertyName',
      code: inMakeBody(`Match.value(input).notPipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`),
    },
    {
      name: 'Should_Pass_When_ValueAccessIsComputed',
      code: inMakeBody(`Match['value'](input).pipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`),
    },
    {
      name: 'Should_Pass_When_ValueObjectIsNotIdentifier',
      code: inMakeBody(`Other.Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`),
    },
    {
      name: 'Should_Pass_When_ComputedPipeAccess',
      code: inMakeBody(`Match.value(input)['pipe'](
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`),
    },
    {
      name: 'Should_Pass_When_CalleeIsNotMemberExpression',
      code: inMakeBody(`someFn(Match.tag('A', () => a), Match.orElse(() => fallback))`),
    },
    {
      name: 'Should_Pass_When_PipeObjectIsNotCallExpression',
      code: inMakeBody(`foo.pipe(
        Match.tag('A', () => a),
        Match.orElse(() => fallback)
      )`),
    },
    {
      name: 'Should_Pass_When_TagReferenceIsNotATagArm',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag,
        Match.exhaustive
      )`),
    },
    {
      name: 'Should_Pass_When_NonMatchTagCall',
      code: inMakeBody(`Match.value(input).pipe(
        Other.Match.tag('A', () => a),
        Match.exhaustive
      )`),
    },
    {
      name: 'Should_Pass_When_RecordArmSurvivorPrecedesPredicateArm',
      code: inMakeBody(`Match.value({ hasReference, hasDelegation }).pipe(
        Match.when({ hasReference: true }, () => referenced),
        Match.when({ hasDelegation: false }, () => none),
        Match.orElse(() => delegated)
      )`),
    },
    {
      name: 'Should_Pass_When_PipeHasNoArguments',
      code: inMakeBody(`Match.value(input).pipe()`),
    },
    {
      name: 'Should_Pass_When_OrElseNamespaceIsNotMatch',
      code: inMakeBody(`Match.value(input).pipe(
        Other.orElse(() => fallback)
      )`),
    },
    {
      name: 'Should_Pass_When_AFollowedModuleScopeBodyDispatchesExhaustively',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

const decide = (input: unknown): Result.Result<string, never> =>
  Match.value(input).pipe(
    Match.tag('A', () => Result.succeed('a')),
    Match.tag('B', () => Result.succeed('b')),
    Match.exhaustive,
  )

export const decision = Workflow.make(decide)`,
    },
    {
      name: 'Should_Pass_When_AFixtureInATestFileUsesOrElseOnATagChain',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('A', () => Result.succeed('a')),
        Match.orElse(() => Result.succeed('fallback'))
      )`),
      filename: 'interpreter.integration.test.ts',
    },
    {
      name: 'Should_Pass_When_TwoArgumentTagChainEndsWithExhaustive',
      code: inTwoArgMakeBody(`Match.value(input).pipe(
        Match.tag('A', () => Result.succeed('a')),
        Match.exhaustive
      )`),
      filename: 'cancel-order.workflow.ts',
    },
  ],
  invalid: [
    {
      name: 'Should_ReportOrElse_When_TagChainEndsWithOrElse',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.tag('B', () => b),
        Match.orElse(() => fallback)
      )`),
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // The dark-boundary control: if the locator resolves only argument 0 it
      // finds the class, produces no body, and this violation goes unreported.
      name: 'Should_ReportOrElse_When_TheDeciderIsTheSecondArgument',
      code: inTwoArgMakeBody(`Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.tag('B', () => b),
        Match.orElse(() => fallback)
      )`),
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // Slot 1 reached by name, not inline: `followIdentifier` must run on the
      // argument that resolves to a function, not stop at the class in slot 0.
      name: 'Should_ReportOrElse_When_TheSecondArgumentIsAModuleScopeReference',
      code: `${MAKE_IMPORTS}import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}

const decide = (input: Cmd): Result.Result<string, never> =>
  Match.value(input).pipe(
    Match.tag('A', () => a),
    Match.tag('B', () => b),
    Match.orElse(() => fallback)
  )

export const decision = Workflow.make(Cmd, decide)`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      name: 'Should_ReportMissing_WhenTagChainHasNoTerminator',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.tag('B', () => b)
      )`),
      errors: [{ messageId: 'missingExhaustive', data: MISSING_EXHAUSTIVE }],
    },
    {
      name: 'Should_ReportOrElse_WhenTagAndWhenMixEndsWithOrElse',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.when({ active: true }, () => active),
        Match.orElse(() => fallback)
      )`),
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      name: 'Should_ReportOrElse_WhenTagChainEndsWithOrElseReference',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.orElse
      )`),
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      name: 'Should_ReportMissing_WhenTagChainEndsWithOtherCall',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('A', () => a),
        someOtherFn()
      )`),
      errors: [{ messageId: 'missingExhaustive', data: MISSING_EXHAUSTIVE }],
    },
    {
      name: 'Should_ReportMissing_WhenTagChainEndsWithLiteral',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('A', () => a),
        'trailing'
      )`),
      errors: [{ messageId: 'missingExhaustive', data: MISSING_EXHAUSTIVE }],
    },
    {
      name: 'Should_ReportOpenDispatch_WhenPredicateArmEndsWithOrElse',
      code: inMakeBody(`Match.value(cmd.text).pipe(
        Match.when(opensWithSigil, () => host),
        Match.orElse(() => model)
      )`),
      errors: [{ messageId: 'orElseOnOpenDispatch', data: OR_ELSE_ON_OPEN }],
    },
    {
      name: 'Should_ReportOpenDispatch_WhenLiteralArmsEndWithOrElse',
      code: inMakeBody(`Match.value(result.code).pipe(
        Match.when(2, () => block),
        Match.when(0, () => zero),
        Match.orElse(() => other)
      )`),
      errors: [{ messageId: 'orElseOnOpenDispatch', data: OR_ELSE_ON_OPEN }],
    },
    {
      name: 'Should_ReportOpenDispatch_WhenOrElseIsTheOnlyArm',
      code: inMakeBody(`Match.value(input).pipe(
        Match.orElse(() => fallback)
      )`),
      errors: [{ messageId: 'orElseOnOpenDispatch', data: OR_ELSE_ON_OPEN }],
    },
    {
      name: 'Should_ReportOpenDispatch_WhenBareTagReferencePrecedesOrElse',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag,
        Match.orElse(() => fallback)
      )`),
      errors: [{ messageId: 'orElseOnOpenDispatch', data: OR_ELSE_ON_OPEN }],
    },
    {
      name: 'Should_ReportOpenDispatch_WhenArmCalleeIsNotAMemberExpression',
      code: inMakeBody(`Match.value(input).pipe(
        someFn({ active: true }),
        Match.orElse(() => fallback)
      )`),
      errors: [{ messageId: 'orElseOnOpenDispatch', data: OR_ELSE_ON_OPEN }],
    },
    {
      name: 'Should_ReportOpenDispatch_WhenRecordArmNamespaceIsNotMatch',
      code: inMakeBody(`Match.value(input).pipe(
        Other.when({ active: true }, () => active),
        Match.orElse(() => fallback)
      )`),
      errors: [{ messageId: 'orElseOnOpenDispatch', data: OR_ELSE_ON_OPEN }],
    },
    {
      name: 'Should_ReportOpenDispatch_WhenRecordArmMethodIsNotWhen',
      code: inMakeBody(`Match.value(input).pipe(
        Match.notWhen({ active: true }, () => active),
        Match.orElse(() => fallback)
      )`),
      errors: [{ messageId: 'orElseOnOpenDispatch', data: OR_ELSE_ON_OPEN }],
    },
  ],
})
