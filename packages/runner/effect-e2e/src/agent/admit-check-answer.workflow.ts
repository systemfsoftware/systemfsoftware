import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { Locator, LocatorExpression } from '../engine/locator.schema.js'
import { Observation } from '../engine/observation.schema.js'
import { normalizeRoute, Route } from '../engine/route.schema.js'
import { Message, ModelAnswer, ToolCall } from '../model/model.schema.js'
import { Check, CheckState } from '../verdict/check.schema.js'
import { lookupNode } from './located-node.schema.js'

const CheckTargetRef = Schema.Struct({ ref: Schema.String }).annotate({
  description: 'The [ref] of a node on the current screen.',
})
const CheckTargetRole = Schema.Struct({
  role: Schema.String,
  name: Schema.optionalKey(Schema.String),
}).annotate({
  description:
    'The role, and optionally the accessible name, of a control; use it for a control that is not on the screen yet.',
})

const CheckTarget = Schema.Union([CheckTargetRef, CheckTargetRole])

const negateField = { negate: Schema.optionalKey(Schema.Boolean) }

const PresentLiteral = Schema.Struct({
  predicate: Schema.Literal('present'),
  target: CheckTarget,
  ...negateField,
}).annotate({
  description: 'The target control is present on the current screen.',
})
const TextLiteral = Schema.Struct({
  predicate: Schema.Literal('text'),
  target: CheckTarget,
  match: Schema.Literals(['exact', 'contains']),
  value: Schema.String,
  ...negateField,
}).annotate({
  description: 'The text of the target control equals, or contains, the value.',
})
const ValueLiteral = Schema.Struct({
  predicate: Schema.Literal('value'),
  target: CheckTarget,
  match: Schema.Literals(['exact', 'contains']),
  value: Schema.String,
  ...negateField,
}).annotate({
  description: 'The value of the target control equals, or contains, the value.',
})
const StateLiteral = Schema.Struct({
  predicate: Schema.Literal('state'),
  target: CheckTarget,
  state: CheckState,
  expected: Schema.Boolean,
  ...negateField,
}).annotate({
  description: 'The target control carries the state, such as checked, as expected.',
})
const RouteLiteral = Schema.Struct({
  predicate: Schema.Literal('route'),
  path: Schema.String,
  ...negateField,
}).annotate({
  description: 'The app shows this path, with an optional ?query, on the same origin as the current screen.',
})

/** One check literal: a predicate over a target, optionally negated. */
export const CheckLiteral = Schema.Union([PresentLiteral, TextLiteral, ValueLiteral, StateLiteral, RouteLiteral])
export type CheckLiteral = typeof CheckLiteral.Type

/** The arguments of the resolve_check tool: one or more literals combined with all or any. */
export const ResolveCheckArguments = Schema.Struct({
  combine: Schema.Literals(['all', 'any']).annotate({
    description: 'How to combine the literals: every one holds, or any one of them holds.',
  }),
  literals: Schema.Array(CheckLiteral).annotate({
    description: 'The check to run, given one literal at a time; an empty list is refused.',
  }),
})
export type ResolveCheckArguments = typeof ResolveCheckArguments.Type

/** The one name of the resolve_check tool, as a schema so the shell derives nothing by hand. */
export const ResolveCheckToolName = Schema.Literal('resolve_check')

const AdmitCheckAnswerDecisionTypeId: unique symbol = Symbol.for(
  '@systemfsoftware/effect-e2e/AdmitCheckAnswerDecision',
)
type AdmitCheckAnswerDecisionTypeId = typeof AdmitCheckAnswerDecisionTypeId

export class CheckAdmitted extends Schema.TaggedClass<CheckAdmitted>()('CheckAdmitted', {
  check: Check,
  callId: Schema.String,
}) {
  readonly [AdmitCheckAnswerDecisionTypeId] = AdmitCheckAnswerDecisionTypeId
}

export class CheckRefused extends Schema.TaggedClass<CheckRefused>()('CheckRefused', {
  replies: Schema.NonEmptyArray(Message),
}) {
  readonly [AdmitCheckAnswerDecisionTypeId] = AdmitCheckAnswerDecisionTypeId
}

export const AdmitCheckAnswerDecision = Schema.Union([CheckAdmitted, CheckRefused])
export type AdmitCheckAnswerDecision = typeof AdmitCheckAnswerDecision.Type

export class AdmitCheckAnswer extends Schema.TaggedClass<AdmitCheckAnswer>()('AdmitCheckAnswer', {
  answer: ModelAnswer,
  observation: Observation,
  refsOffered: Schema.Boolean,
}) {
  static readonly [Workflow.InstrumentationBrand] = {} as const
}

const TEXT_ANSWER_CONTENT = 'reply with exactly one tool call: resolve_check, with the check to run as its arguments'

const unknownToolContent = (name: string): string => `unknown tool "${name}"; call resolve_check with the check to run`

const MALFORMED_ARGUMENTS_CONTENT = 'the arguments for "resolve_check" do not match its schema'

const EMPTY_LITERALS_CONTENT = 'at least one check literal is required; an empty check proves nothing'

const absentRefContent = (ref: string): string =>
  `ref "${ref}" is not a visible node on the current screen; target a node by the [ref] shown on the current screen`

const roleMissingContent = (id: string): string => `node "${id}" has no role, so it cannot be targeted`

const REFS_NOT_OFFERED_CONTENT = 'this screen offers no [ref] ids; target the control by role and name'

const ONE_CALL_CONTENT = 'not run: one call per turn'

const toolReplyOf = (callId: string, content: string): Message => ({ _tag: 'ToolMessage', toolCallId: callId, content })

const textReplyOf = (content: string): Message => ({
  _tag: 'UserMessage',
  content: [{ _tag: 'TextPart', text: content }],
})

const refusalRepliesOf = (
  calls: ReadonlyArray<ToolCall>,
  answeredId: string,
  reason: string,
): Arr.NonEmptyReadonlyArray<Message> =>
  Arr.prepend(
    Arr.map(Arr.filter(calls, (call) => call.id !== answeredId), (call) => toolReplyOf(call.id, ONE_CALL_CONTENT)),
    toolReplyOf(answeredId, reason),
  )

const refusedOf = (calls: ReadonlyArray<ToolCall>, answeredId: string, reason: string): CheckRefused =>
  new CheckRefused({ replies: refusalRepliesOf(calls, answeredId, reason) })

const textRefused = (): CheckRefused => new CheckRefused({ replies: [textReplyOf(TEXT_ANSWER_CONTENT)] })

const queryPairOf = (pair: string): readonly [string, string] =>
  Match.value(pair.includes('=')).pipe(
    Match.when(true, () => {
      const at = pair.indexOf('=')
      return [pair.slice(0, at), pair.slice(at + 1)] as const
    }),
    Match.when(false, () => [pair, ''] as const),
    Match.exhaustive,
  )

const queryOf = (raw: string): ReadonlyArray<readonly [string, string]> =>
  Match.value(raw === '').pipe(
    Match.when(true, () => []),
    Match.when(false, () => raw.split('&').map(queryPairOf)),
    Match.exhaustive,
  )

const routeOf = (origin: string, path: string): Route =>
  Match.value(path.includes('?')).pipe(
    Match.when(true, () => {
      const at = path.indexOf('?')
      return { origin, path: path.slice(0, at), query: queryOf(path.slice(at + 1)) }
    }),
    Match.when(false, () => ({ origin, path, query: [] })),
    Match.exhaustive,
  )

const roleLocatorOf = (role: string, name: Option.Option<string>): Locator => ({
  expression: Option.match(name, {
    onNone: (): LocatorExpression => ({ kind: 'ByRole', role }),
    onSome: (value): LocatorExpression => ({ kind: 'ByRole', role, name: { value, exact: true } }),
  }),
  label: Option.match(name, {
    onNone: () => role,
    onSome: (value) => `${role} "${value}"`,
  }),
})

const refLocatorResultOf = (command: AdmitCheckAnswer, ref: string): Result.Result<Locator, string> =>
  Match.value(command.refsOffered).pipe(
    Match.when(false, (): Result.Result<Locator, string> => Result.fail(REFS_NOT_OFFERED_CONTENT)),
    Match.when(true, () =>
      Match.value(lookupNode(command.observation, ref)).pipe(
        Match.tag('NodeAbsent', (): Result.Result<Locator, string> => Result.fail(absentRefContent(ref))),
        Match.tag('NodeRoleless', (): Result.Result<Locator, string> => Result.fail(roleMissingContent(ref))),
        Match.tag('NodeLocated', ({ located }): Result.Result<Locator, string> => Result.succeed(located.locator)),
        Match.exhaustive,
      )),
    Match.exhaustive,
  )

const locatorResultOf = (
  command: AdmitCheckAnswer,
  target: typeof CheckTargetRef.Type | typeof CheckTargetRole.Type,
): Result.Result<Locator, string> =>
  Match.value(target).pipe(
    Match.when(Schema.is(CheckTargetRef), (refTarget) => refLocatorResultOf(command, refTarget.ref)),
    Match.orElse((roleTarget) => Result.succeed(roleLocatorOf(roleTarget.role, Option.fromNullishOr(roleTarget.name)))),
  )

const negatedOf = (negate: boolean | undefined, check: Check): Check =>
  Match.value(negate === true).pipe(
    Match.when(true, (): Check => ({ _tag: 'Not', check })),
    Match.when(false, (): Check => check),
    Match.exhaustive,
  )

const leafResultOf = (command: AdmitCheckAnswer, literal: CheckLiteral): Result.Result<Check, string> =>
  Match.value(literal).pipe(
    Match.discriminatorsExhaustive('predicate')({
      present: ({ target, negate }) =>
        Result.map(locatorResultOf(command, target), (locator) => negatedOf(negate, { _tag: 'Present', locator })),
      text: ({ target, match, value, negate }) =>
        Result.map(
          locatorResultOf(command, target),
          (locator) => negatedOf(negate, { _tag: 'Text', locator, match: { kind: match, value } }),
        ),
      value: ({ target, match, value, negate }) =>
        Result.map(
          locatorResultOf(command, target),
          (locator) => negatedOf(negate, { _tag: 'Value', locator, match: { kind: match, value } }),
        ),
      state: ({ target, state, expected, negate }) =>
        Result.map(
          locatorResultOf(command, target),
          (locator) => negatedOf(negate, { _tag: 'State', locator, state, expected }),
        ),
      route: ({ path, negate }) =>
        Result.succeed(
          negatedOf(negate, { _tag: 'Route', route: normalizeRoute(routeOf(command.observation.route.origin, path)) }),
        ),
    }),
  )

const reasonOf = (result: Result.Result<Check, string>): string =>
  result.pipe(Result.match({ onFailure: (reason) => reason, onSuccess: () => '' }))

const manyCombinedOf = (combine: 'all' | 'any', checks: ReadonlyArray<Check>): Check =>
  Match.value(combine).pipe(
    Match.when('all', (): Check => ({ _tag: 'AllOf', checks })),
    Match.when('any', (): Check => ({ _tag: 'AnyOf', checks })),
    Match.exhaustive,
  )

const combinedOf = (combine: 'all' | 'any') => (checks: ReadonlyArray<Check>): Check =>
  Arr.match(checks, {
    onEmpty: (): Check => manyCombinedOf(combine, checks),
    onNonEmpty: ([first, ...rest]) =>
      Option.match(Arr.head(rest), {
        onNone: (): Check => first,
        onSome: (): Check => manyCombinedOf(combine, checks),
      }),
  })

const checksResultOf = (command: AdmitCheckAnswer, args: ResolveCheckArguments): Result.Result<Check, string> => {
  const results = Arr.map(args.literals, (literal) => leafResultOf(command, literal))
  return Option.match(Arr.findFirst(results, Result.isFailure), {
    onNone: () => Result.succeed(combinedOf(args.combine)(Arr.map(results, Result.getOrThrow))),
    onSome: (failure) => failure.pipe(reasonOf, Result.fail),
  })
}

const admittedDecision = (
  command: AdmitCheckAnswer,
  calls: Arr.NonEmptyReadonlyArray<ToolCall>,
  first: ToolCall,
  args: ResolveCheckArguments,
): AdmitCheckAnswerDecision =>
  Result.match(checksResultOf(command, args), {
    onFailure: (reason) => refusedOf(calls, first.id, reason),
    onSuccess: (check) => new CheckAdmitted({ check, callId: first.id }),
  })

const literalsDecision = (
  command: AdmitCheckAnswer,
  calls: Arr.NonEmptyReadonlyArray<ToolCall>,
  first: ToolCall,
  args: ResolveCheckArguments,
): AdmitCheckAnswerDecision =>
  Match.value(args.literals.length === 0).pipe(
    Match.when(true, () => refusedOf(calls, first.id, EMPTY_LITERALS_CONTENT)),
    Match.when(false, () => admittedDecision(command, calls, first, args)),
    Match.exhaustive,
  )

const argumentsDecision = (
  command: AdmitCheckAnswer,
  calls: Arr.NonEmptyReadonlyArray<ToolCall>,
  first: ToolCall,
): AdmitCheckAnswerDecision =>
  Result.match(Schema.decodeUnknownResult(ResolveCheckArguments)(first.arguments), {
    onFailure: () => refusedOf(calls, first.id, MALFORMED_ARGUMENTS_CONTENT),
    onSuccess: (args) => literalsDecision(command, calls, first, args),
  })

const callDecision = (
  command: AdmitCheckAnswer,
  calls: Arr.NonEmptyReadonlyArray<ToolCall>,
): AdmitCheckAnswerDecision => {
  const first = Arr.headNonEmpty(calls)
  return Match.value(first.name).pipe(
    Match.when('resolve_check', () => argumentsDecision(command, calls, first)),
    Match.orElse(() => refusedOf(calls, first.id, unknownToolContent(first.name))),
  )
}

const answerDecision = (command: AdmitCheckAnswer): AdmitCheckAnswerDecision =>
  Match.valueTags(command.answer, {
    Text: () => textRefused(),
    ToolCalls: ({ calls }) => callDecision(command, calls),
  })

export const admitCheckAnswer = Workflow.make({
  command: AdmitCheckAnswer,
  decision: AdmitCheckAnswerDecision,
  error: Schema.Never,
  decide: (command): Result.Result<AdmitCheckAnswerDecision, never> => Result.succeed(answerDecision(command)),
})
