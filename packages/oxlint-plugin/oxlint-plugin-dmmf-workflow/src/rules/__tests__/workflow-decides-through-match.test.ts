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
  ],
})
