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
 * The fixture spine: every dispatch under test lives inside the `decide` property
 * of a `Workflow.make` options object, the boundary the rule keys on. Suffix
 * fixtures are gone; scope cases prove the complement stays silent.
 */
const MAKE_IMPORTS = `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
`

const SCHEMA_CLASSES = `class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}
`

const inMakeBody = (body: string): string =>
  `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: unknown): Result.Result<string, never> => ${body},
})`

/**
 * The options object read by name: `decide` written before `command` proves the
 * slots are properties, not positions — a locator pinned to an argument slot or a
 * property order finds nothing and this rule goes silently dark.
 */
const inReorderedOptionsBody = (body: string): string =>
  `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
export const decision = Workflow.make({
  decide: (input: Cmd): Result.Result<string, never> => ${body},
  command: Cmd,
  decision: Decision,
  error: S.Never,
})`

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

const Workflow = { make: (options: unknown) => options }
Workflow.make({ command: input, decide: (input: unknown) =>
  Match.value(input).pipe(
    Match.tag('A', () => a),
    Match.orElse(() => b)
  ) })`,
    },
    {
      name: 'Should_Ignore_When_FileImportsAnotherModuleWorkflow',
      code: `import { Workflow } from 'some-other-package'
import * as Match from 'effect/Match'

Workflow.make({ command: input, decide: (input: unknown) =>
  Match.value(input).pipe(
    Match.tag('A', () => a),
    Match.orElse(() => b)
  ) })`,
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
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const decide = (input: unknown): Result.Result<string, never> =>
  Match.value(input).pipe(
    Match.tag('A', () => Result.succeed('a')),
    Match.tag('B', () => Result.succeed('b')),
    Match.exhaustive,
  )

export const decision = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide })`,
    },
    {
      name: 'Should_Pass_When_AShorthandDecideDispatchesExhaustively',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const decide = (input: unknown): Result.Result<string, never> =>
  Match.value(input).pipe(
    Match.tag('A', () => Result.succeed('a')),
    Match.tag('B', () => Result.succeed('b')),
    Match.exhaustive,
  )

export const decision = Workflow.make({ decide, command: Cmd, decision: Decision, error: S.Never })`,
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
      name: 'Should_Pass_When_AComputedMakeDispatchesExhaustively',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
export const decision = Workflow['make']({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: unknown): Result.Result<string, never> =>
    Match.value(input).pipe(
      Match.tag('A', () => Result.succeed('a')),
      Match.tag('B', () => Result.succeed('b')),
      Match.exhaustive,
    ),
})`,
      filename: 'cancel-order.workflow.ts',
    },
    {
      // A helper outside the reach of every decide body is other code: only the
      // functions the body reaches are judged, so an unreached dispatch stays silent.
      name: 'Should_Ignore_AHelper_ThatOnlyCodeOutsideEveryDecideBodyCalls',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const backoffOf = (k: unknown) =>
  Match.value(k).pipe(
    Match.tag('A', () => 'a'),
    Match.orElse(() => 'fallback')
  )

const outside = backoffOf(input)

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed('ok'),
})`,
    },
    {
      // A reached helper that terminates its dispatch with Match.exhaustive is
      // judged exactly as the body: nothing to report.
      name: 'Should_Pass_When_AReachedHelperDispatchesExhaustively',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const backoffOf = (k: unknown) =>
  Match.value(k).pipe(
    Match.tag('A', () => Result.succeed('a')),
    Match.tag('B', () => Result.succeed('b')),
    Match.exhaustive
  )

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(backoffOf(input)),
})`,
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
      // The dark-boundary control: if the locator resolves only an argument slot it
      // finds nothing inside the options object, produces no body, and this
      // violation goes unreported.
      name: 'Should_ReportOrElse_When_TheDecidePropertyIsWrittenBeforeTheCommand',
      code: inReorderedOptionsBody(`Match.value(input).pipe(
        Match.tag('A', () => a),
        Match.tag('B', () => b),
        Match.orElse(() => fallback)
      )`),
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // The decision reached by name, not inline: the property value identifier must
      // be followed to its module-scope declaration, not left unresolved.
      name: 'Should_ReportOrElse_When_TheDecidePropertyReferencesAModuleScopeFunction',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const decide = (input: Cmd): Result.Result<string, never> =>
  Match.value(input).pipe(
    Match.tag('A', () => a),
    Match.tag('B', () => b),
    Match.orElse(() => fallback)
  )

export const decision = Workflow.make({ command: Cmd, decision: Decision, error: S.Never, decide })`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // Shorthand property, same obligation: `{ decide }` binds like `decide: decide`.
      name: 'Should_ReportOrElse_When_TheShorthandDecideEndsWithOrElse',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const decide = (input: Cmd): Result.Result<string, never> =>
  Match.value(input).pipe(
    Match.tag('A', () => a),
    Match.tag('B', () => b),
    Match.orElse(() => fallback)
  )

export const decision = Workflow.make({ decide, command: Cmd, decision: Decision, error: S.Never })`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // The callee is judged by origin, so the computed `Workflow['make']` spelling
      // is the same boundary and its decide body is judged like any other.
      name: 'Should_ReportOrElse_When_AComputedMakeEndsWithOrElse',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
export const decision = Workflow['make']({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> =>
    Match.value(input).pipe(
      Match.tag('A', () => a),
      Match.tag('B', () => b),
      Match.orElse(() => fallback)
    ),
})`,
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
    {
      // The decision hides its dispatch in a same-file helper. The classifier already
      // follows the helper for purity, so the dispatch is judged exactly as it would be
      // inside the body.
      name: 'Should_ReportOrElse_When_TheDecideBodyCallsAHelperThatEndsWithOrElse',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const backoffOf = (k: unknown) =>
  Match.value(k).pipe(
    Match.tag('A', () => 'a'),
    Match.orElse(() => 'fallback')
  )

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(backoffOf(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // Reached through two calls, body -> outer -> inner: the inner dispatch is judged
      // once, with no duplicate report.
      name: 'Should_ReportOrElseOnce_When_TheDecideBodyReachesAHelperThroughAnotherHelper',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const inner = (k: unknown) =>
  Match.value(k).pipe(
    Match.tag('A', () => 'a'),
    Match.orElse(() => 'fallback')
  )
const outer = (k: unknown) => inner(k)

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(outer(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // A record member the body calls is entered like a helper: its dispatch is
      // judged exactly as it would be inside the body.
      name: 'Should_ReportOrElse_When_TheDecideBodyCallsARecordMemberThatEndsWithOrElse',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const helpers = {
  choose: (k: unknown) =>
    Match.value(k).pipe(
      Match.tag('A', () => 'a'),
      Match.orElse(() => 'fallback')
    ),
}

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
      decide: (input: Cmd): Result.Result<string, never> => Result.succeed(helpers.choose(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // The record member is reached through a module-scope alias: `dispatch` names
      // `helpers.choose`, so the dispatch inside the member is the decision's dispatch.
      name: 'Should_ReportOrElse_When_TheDecideBodyCallsAModuleAliasOfARecordMemberEndingWithOrElse',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const helpers = {
  choose: (k: unknown) =>
    Match.value(k).pipe(
      Match.tag('A', () => 'a'),
      Match.orElse(() => 'fallback')
    ),
}
const dispatch = helpers.choose

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(dispatch(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // A record pinned with `satisfies` is still a record: the member the body
      // calls is entered like a helper.
      name: 'Should_ReportOrElse_When_TheDecideBodyCallsAMemberOfASatisfiesWrappedRecord',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const helpers = {
  choose: (k: unknown) =>
    Match.value(k).pipe(
      Match.tag('A', () => 'a'),
      Match.orElse(() => 'fallback')
    ),
} satisfies Record<string, (k: unknown) => string>

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(helpers.choose(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      name: 'Should_ReportOrElse_When_TheDecideBodyCallsASatisfiesWrappedRecordMember',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const helpers = {
  choose: ((k: unknown) =>
    Match.value(k).pipe(
      Match.tag('A', () => 'a'),
      Match.orElse(() => 'fallback')
    )) satisfies (k: unknown) => string,
}

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(helpers.choose(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      name: 'Should_ReportOrElse_When_TheDecideBodyCallsAComputedRecordMember',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const pass = <F>(f: F): F => f

const helpers = {
  choose: pass((k: unknown) =>
    Match.value(k).pipe(
      Match.tag('A', () => 'a'),
      Match.orElse(() => 'fallback')
    )
  ),
}

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(helpers.choose(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // A module-scope const whose initializer is computed is judged whole, so a
      // dispatch inside it is the decision's dispatch.
      name: 'Should_ReportOrElse_When_TheDecideBodyReadsAComputedConstHoldingTheDispatch',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const helpers = Object.freeze({
  choose: (k: unknown) =>
    Match.value(k).pipe(
      Match.tag('A', () => 'a'),
      Match.orElse(() => 'fallback')
    ),
})

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(helpers.choose(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      name: 'Should_ReportOrElse_When_AnUncalledMemberOfAComputedConstEndsWithOrElse',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const helpers = Object.freeze({
  label: (k: string) => k,
  choose: (k: unknown) =>
    Match.value(k).pipe(
      Match.tag('A', () => 'a'),
      Match.orElse(() => 'fallback')
    ),
})

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(helpers.label(input._tag)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      name: 'Should_ReportOrElse_When_AnUncalledMethodOfAReferencedClassEndsWithOrElse',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
class Choice {
  static label(k: string) {
    return k
  }
  static choose(k: unknown) {
    return Match.value(k).pipe(
      Match.tag('A', () => 'a'),
      Match.orElse(() => 'fallback')
    )
  }
}

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(Choice.label(input._tag)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // A module-scope class the body references is entered like a helper: the
      // dispatch inside its static method is judged exactly as it would be inside
      // the body.
      name: 'Should_ReportOrElse_When_TheDecideBodyCallsAClassStaticMethodThatEndsWithOrElse',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
class Choice {
  static choose(k: unknown) {
    return Match.value(k).pipe(
      Match.tag('A', () => 'a'),
      Match.orElse(() => 'fallback')
    )
  }
}

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(Choice.choose(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // A module-scope `function` declaration is a helper like a const arrow: the
      // dispatch inside it is judged exactly as it would be inside the body.
      name: 'Should_ReportOrElse_When_TheReachedFunctionDeclarationEndsWithOrElse',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
function backoffOf(k: unknown) {
  return Match.value(k).pipe(
    Match.tag('A', () => 'a'),
    Match.orElse(() => 'fallback')
  )
}

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(backoffOf(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // A reached helper that omits the terminator is judged like the body.
      name: 'Should_ReportMissing_When_TheReachedHelperHasTagArmsAndNoTerminator',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const backoffOf = (k: unknown) =>
  Match.value(k).pipe(
    Match.tag('A', () => 'a'),
    Match.tag('B', () => 'b')
  )

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(backoffOf(input)),
})`,
      errors: [{ messageId: 'missingExhaustive', data: MISSING_EXHAUSTIVE }],
    },
    {
      // The initializer is a function once its `satisfies` wrapper is unwrapped:
      // the helper is judged like any other, not left as an opaque module value.
      name: 'Should_ReportOrElse_When_TheReachedHelperIsASatisfiesWrappedConstArrow',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
type Handler = (k: unknown) => unknown

const backoffOf = ((k: unknown) =>
  Match.value(k).pipe(
    Match.tag('A', () => 'a'),
    Match.orElse(() => 'fallback')
  )) satisfies Handler

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(backoffOf(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
    {
      // The `as` wrapper is the same wrapper, judged the same way.
      name: 'Should_ReportOrElse_When_TheReachedHelperIsAnAsWrappedConstArrow',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
type Handler = (k: unknown) => unknown

const backoffOf = ((k: unknown) =>
  Match.value(k).pipe(
    Match.tag('A', () => 'a'),
    Match.orElse(() => 'fallback')
  )) as Handler

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(backoffOf(input)),
})`,
      errors: [{ messageId: 'orElseOnClosedUnion', data: NORELSE_ON_CLOSED }],
    },
  ],
})
