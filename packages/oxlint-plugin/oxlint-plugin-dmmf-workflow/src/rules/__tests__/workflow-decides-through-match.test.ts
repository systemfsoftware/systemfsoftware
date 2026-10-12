import { RuleTester } from 'oxlint/plugins-dev'
import * as vitest from 'vitest'

import { workflowDecidesThroughMatch } from '../workflow-decides-through-match.js'

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
 * of a `Workflow.make` options object, the boundary the rule keys on. Cases
 * outside every `decide` body prove the complement stays silent.
 */
const MAKE_IMPORTS = `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
`

const SCHEMA_CLASSES = `class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}
class AlreadyApproved extends S.TaggedClass<AlreadyApproved>()('AlreadyApproved', {}) {}
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

const UNCHANGED_SUCCESS = {
  name: 'Result.succeed(...) inside a Match handler',
  expected: 'a distinct success or refusal variant',
  actual: 'success wrapping the matched value unchanged',
  fix: 'construct a named variant that names the business outcome instead of returning the subject',
}

const TAG_KEYED_DISPATCH = {
  name: 'a member keyed by a _tag value',
  expected: 'Match.tag arms closed by Match.exhaustive',
  actual: 'a table lookup keyed by a state tag',
  fix: 'replace the tag-keyed lookup with Match.tag arms ended by Match.exhaustive',
}

ruleTester.run('workflow-decides-through-match', workflowDecidesThroughMatch, {
  valid: [
    {
      name: 'Should_Pass_When_TheHandlerConstructsANamedVariant',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', () => Result.succeed(AlreadyApproved.make({}))),
        Match.exhaustive
      )`),
    },
    {
      name: 'Should_Pass_When_TheHandlerWrapsANewStateVariant',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', (s) => Result.succeed(new Decision({ state: s }))),
        Match.exhaustive
      )`),
    },
    {
      name: 'Should_Pass_When_TheHandlerFails',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', (s) => Result.fail('refused')),
        Match.exhaustive
      )`),
    },
    {
      name: 'Should_Pass_When_SuccessIsOutsideEveryMatchArm',
      code: inMakeBody(`Result.succeed(input)`),
    },
    {
      name: 'Should_Pass_When_TheTagReadIsAComparison',
      code: inMakeBody(`state._tag === 'Approved' ? Result.succeed(AlreadyApproved.make({})) : Result.fail('no')`),
    },
    {
      name: 'Should_Ignore_TheSameHandler_OutsideEveryMakeBoundary',
      code: `import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

const decide = (order: unknown) =>
  Match.value(order).pipe(
    Match.tag('Approved', (s) => Result.succeed(s)),
    Match.exhaustive
  )

export { decide }`,
    },
    {
      name: 'Should_Ignore_TheTagKeyedTable_OutsideEveryMakeBoundary',
      code: `const table = { Approved: 1 }
const state = { _tag: 'Approved' }
const picked = table[state._tag]
export { picked }`,
    },
    {
      name: 'Should_Pass_When_AShadowingInnerBindingReturnsItsOwnParameter',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', (s) => {
          const inner = (s: unknown) => Result.succeed(s)
          return inner(s) === undefined ? Result.fail('no') : Result.fail('no')
        }),
        Match.exhaustive
      )`),
    },
    {
      name: 'Should_Pass_When_TheComputedIndexIsNotTagKeyed',
      code: inMakeBody(`table[state.kind]`),
    },
    {
      name: 'Should_Pass_When_EffectRootNamedImportsConstructAVariant',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result } from 'effect'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}
class AlreadyApproved extends S.TaggedClass<AlreadyApproved>()('AlreadyApproved', {}) {}

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: unknown) => Match.value(input).pipe(
    Match.tag('Approved', () => Result.succeed(AlreadyApproved.make({}))),
    Match.exhaustive
  ),
})`,
    },
    {
      name: 'Should_Pass_When_TheFlaggedShapesSitOutsideTheDecideBody',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const unrelated = Match.value({}).pipe(
  Match.tag('Approved', (s) => Result.succeed(s)),
  Match.exhaustive
)
export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: unknown) => Result.succeed(input),
})
export { unrelated }`,
    },
    {
      name: 'Should_Pass_When_TheInvalidShapeIsInAnIntegrationTestFile',
      filename: 'interpreter.integration.test.ts',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', (s) => Result.succeed(s)),
        Match.exhaustive
      )`),
    },
    {
      // The unchanged success is in a helper only module code outside every decide
      // body reaches: other code, judged by nothing here.
      name: 'Should_Ignore_AnUnreachedHelper_When_OnlyModuleCodeOutsideEveryDecideBodyCallsIt',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const backoffOf = (s: unknown) =>
  Match.value(s).pipe(
    Match.tag('Approved', (v) => Result.succeed(v)),
    Match.exhaustive
  )

const outside = backoffOf(input)

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed('ok'),
})`,
    },
  ],
  invalid: [
    {
      name: 'Should_ReportUnchanged_When_TheHandlerReturnsItsParameter',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', (s) => Result.succeed(s)),
        Match.exhaustive
      )`),
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportUnchanged_When_TheParameterIsCopiedThroughAConstAlias',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', (s) => {
          const same = s
          return Result.succeed(same)
        }),
        Match.exhaustive
      )`),
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportUnchanged_When_TheParameterIsAsserted',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', (s) => Result.succeed(s as Decision)),
        Match.exhaustive
      )`),
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportUnchanged_When_TheParameterIsSatisfiesWrapped',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', (s) => Result.succeed(s satisfies Decision)),
        Match.exhaustive
      )`),
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportUnchanged_When_TheParameterIsSpreadCopied',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', (s) => Result.succeed({ ...s })),
        Match.exhaustive
      )`),
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportUnchanged_When_TheHandlerWrapsTheMatchedSubject',
      code: inMakeBody(`Match.value(input.state).pipe(
        Match.tag('Approved', () => Result.succeed(input.state)),
        Match.exhaustive
      )`),
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportTagKeyedDispatch_When_AStateTagKeysATable',
      code: inMakeBody(`table[state._tag]`),
      errors: [{ messageId: 'tagKeyedDispatch', data: TAG_KEYED_DISPATCH }],
    },
    {
      name: 'Should_ReportTagKeyedDispatch_When_ATagKeysAHandlerCall',
      code: inMakeBody(`handlers[command._tag](command)`),
      errors: [{ messageId: 'tagKeyedDispatch', data: TAG_KEYED_DISPATCH }],
    },
    {
      name: 'Should_ReportUnchanged_When_MatchAndSucceedArriveViaAliasedImports',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as M from 'effect/Match'
import { succeed as ok } from 'effect/Result'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: unknown) =>
    M.value(input).pipe(
      M.tag('Approved', (s) => ok(s)),
      M.exhaustive
    ),
})`,
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportUnchanged_When_ANestedArmReusesTheParameterName',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', (s) => Match.value(s).pipe(
          Match.tag('Inner', (s) => Result.succeed(s)),
          Match.exhaustive
        )),
        Match.exhaustive
      )`),
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportUnchanged_When_TheHandlerIsPassedByReference',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const onApproved = (s: unknown) => Result.succeed(s)
export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: unknown) => Match.value(input).pipe(
    Match.tag('Approved', onApproved),
    Match.exhaustive
  ),
})`,
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportTagKeyedDispatch_When_AStringLiteralTagKeysATable',
      code: inMakeBody(`table[state['_tag']]`),
      errors: [{ messageId: 'tagKeyedDispatch', data: TAG_KEYED_DISPATCH }],
    },
    {
      name: 'Should_ReportTagKeyedDispatch_When_AConstAliasOfTheTagKeysATable',
      code: inMakeBody(`{
        const tag = state._tag
        return table[tag]
      }`),
      errors: [{ messageId: 'tagKeyedDispatch', data: TAG_KEYED_DISPATCH }],
    },
    {
      name: 'Should_ReportUnchanged_When_TheAliasChainExceedsTheDepthCap',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', (s) => {
          const a1 = s
          const a2 = a1
          const a3 = a2
          const a4 = a3
          const a5 = a4
          const a6 = a5
          const a7 = a6
          const a8 = a7
          const a9 = a8
          return Result.succeed(a9)
        }),
        Match.exhaustive
      )`),
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportUnchanged_When_EffectRootNamedImportsReportTheParameter',
      code: `import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Result } from 'effect'
import * as S from 'effect/Schema'

class Cmd extends S.TaggedClass<Cmd>()('Cmd', {}) {}
class Decision extends S.TaggedClass<Decision>()('Decision', {}) {}

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: unknown) => Match.value(input).pipe(
    Match.tag('Approved', (s) => Result.succeed(s)),
    Match.exhaustive
  ),
})`,
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportUnchanged_When_TheWhenArmHandlerReturnsItsParameter',
      code: inMakeBody(`Match.value(input).pipe(
        Match.when({ active: true }, (s) => Result.succeed(s)),
        Match.exhaustive
      )`),
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      name: 'Should_ReportUnchanged_When_TheOrElseArmHandlerReturnsItsParameter',
      code: inMakeBody(`Match.value(input).pipe(
        Match.tag('Approved', () => Result.fail('no')),
        Match.orElse((s) => Result.succeed(s))
      )`),
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      // The silent stay hides in a same-file helper the decide body reaches: the
      // unchanged success is judged exactly as it would be inside the body.
      name: 'Should_ReportUnchanged_When_TheDecideBodyReachesAHelperReturningItsParameter',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const passThrough = (s: unknown) =>
  Match.value(s).pipe(
    Match.tag('Approved', (v) => Result.succeed(v)),
    Match.exhaustive
  )

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(passThrough(input)),
})`,
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      // A tag-keyed table dispatch in a reached helper is judged like one in the body.
      name: 'Should_ReportTagKeyedDispatch_When_TheDecideBodyReachesAHelperReadingATagKeyedTable',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const pick = (state: { _tag: string }) => table[state._tag]

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(String(pick(input))),
})`,
      errors: [{ messageId: 'tagKeyedDispatch', data: TAG_KEYED_DISPATCH }],
    },
    {
      // Called twice from the body, the helper's handler is judged once.
      name: 'Should_ReportUnchangedOnce_When_TheDecideBodyCallsAHelperTwice',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const passThrough = (s: unknown) =>
  Match.value(s).pipe(
    Match.tag('Approved', (v) => Result.succeed(v)),
    Match.exhaustive
  )

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> =>
    Result.succeed(String(passThrough(input)) + String(passThrough(input))),
})`,
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      // A record member the body calls is entered like a helper: its dispatch is
      // judged exactly as it would be inside the body.
      name: 'Should_ReportUnchanged_When_TheDecideBodyCallsARecordMemberHoldingTheDispatch',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
const helpers = {
  choose: (s: unknown) =>
    Match.value(s).pipe(
      Match.tag('Approved', (v) => Result.succeed(v)),
      Match.exhaustive
    ),
}

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(helpers.choose(input)),
})`,
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
    {
      // A module-scope class the body references is entered like a helper: the
      // dispatch inside its static method is judged exactly as it would be inside
      // the body.
      name: 'Should_ReportUnchanged_When_TheDecideBodyCallsAClassStaticMethodHoldingTheDispatch',
      code: `${MAKE_IMPORTS}
${SCHEMA_CLASSES}
class Choice {
  static choose(s: unknown) {
    return Match.value(s).pipe(
      Match.tag('Approved', (v) => Result.succeed(v)),
      Match.exhaustive
    )
  }
}

export const decision = Workflow.make({
  command: Cmd,
  decision: Decision,
  error: S.Never,
  decide: (input: Cmd): Result.Result<string, never> => Result.succeed(Choice.choose(input)),
})`,
      errors: [{ messageId: 'unchangedSuccess', data: UNCHANGED_SUCCESS }],
    },
  ],
})
