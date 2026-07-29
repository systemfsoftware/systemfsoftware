import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { Allow, Block, HookResult, Warning } from './hook-dispatcher.schema.js'
import type { HookDecision } from './hook-dispatcher.schema.js'
import { parseHookOutput } from './hook-output.acl.js'
import type { ParsedHookOutput } from './hook-output.acl.js'

const InterpretHookCommandTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/InterpretHookCommand')
export class InterpretHookCommand extends S.TaggedClass<InterpretHookCommand>()('InterpretHookCommand', {
  result: HookResult,
  event: S.String,
}) {
  readonly [InterpretHookCommandTypeId] = InterpretHookCommandTypeId
}

const HookVerdictErrorTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/HookVerdictError')
export class HookVerdictError extends S.TaggedError<HookVerdictError>()('HookVerdictError', {
  raw: S.String,
}) {
  readonly [HookVerdictErrorTypeId] = HookVerdictErrorTypeId
}

// Internal closed union over the exit-code categories (primitive
// dispatch needs a closed shape for Match.exhaustive to bite).
const ExitKindTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/ExitKind')
class ExitBlock extends S.TaggedClass<ExitBlock>()('ExitBlock', {}) {
  readonly [ExitKindTypeId] = ExitKindTypeId
}
class ExitDecisionJson extends S.TaggedClass<ExitDecisionJson>()('ExitDecisionJson', {}) {
  readonly [ExitKindTypeId] = ExitKindTypeId
}
class ExitNoDecision extends S.TaggedClass<ExitNoDecision>()('ExitNoDecision', {}) {
  readonly [ExitKindTypeId] = ExitKindTypeId
}
class ExitOther extends S.TaggedClass<ExitOther>()('ExitOther', {}) {
  readonly [ExitKindTypeId] = ExitKindTypeId
}

const ExitKind = S.Union(ExitBlock, ExitDecisionJson, ExitNoDecision, ExitOther)
type ExitKind = S.Schema.Type<typeof ExitKind>

// Exit 0 is success. Claude Code parses stdout for a decision object and
// otherwise treats the output as non-decision text (blank, a status line,
// a debug echo). Only output that opens with `{` claims to be a decision,
// so only that shape can be malformed.
const decisionJsonStdout = (stdout: string): Option.Option<string> =>
  Option.liftPredicate((trimmed: string): trimmed is string => trimmed.startsWith('{'))(stdout.trim())

const classifyExitZero = (stdout: string): ExitKind =>
  Match.value(decisionJsonStdout(stdout)).pipe(
    Match.tag('Some', () => new ExitDecisionJson({})),
    Match.tag('None', () => new ExitNoDecision({})),
    Match.exhaustive,
  )

const EXIT_CODE_KINDS: Readonly<Record<number, (result: HookResult) => ExitKind>> = {
  0: (result) => classifyExitZero(result.stdout),
  2: () => new ExitBlock({}),
}

const classifyResult = (result: HookResult): ExitKind =>
  Match.value(Option.fromNullable(EXIT_CODE_KINDS[result.code])).pipe(
    Match.tag('Some', (some) => some.value(result)),
    Match.tag('None', () => new ExitOther({})),
    Match.exhaustive,
  )

const spokenStderr = (stderr: string): Option.Option<string> =>
  Option.liftPredicate((trimmed: string): trimmed is string => trimmed !== '')(stderr.trim())

const blockReason = (stderr: string, event: string): string =>
  Match.value(spokenStderr(stderr)).pipe(
    Match.tag('Some', (some) => some.value),
    Match.tag('None', () => `Blocked by ${event} hook`),
    Match.exhaustive,
  )

const BLOCK_REASON_READERS: Readonly<Record<string, (parsed: ParsedHookOutput, event: string) => string>> = {
  deny: (parsed, event) => parsed.hookSpecificOutput?.permissionDecisionReason ?? `Blocked by ${event} hook`,
  block: (parsed, event) => parsed.reason ?? `Blocked by ${event} hook`,
}

const decideFromParsed = (parsed: ParsedHookOutput, event: string): HookDecision =>
  Match.value(
    Option.fromNullable(parsed.hookSpecificOutput?.permissionDecision ?? parsed.decision).pipe(
      Option.flatMapNullable((key) => BLOCK_REASON_READERS[key]),
    ),
  ).pipe(
    Match.tag('Some', (some) => new Block({ reason: some.value(parsed, event) })),
    Match.tag('None', () => new Allow({ updatedInput: parsed.hookSpecificOutput?.updatedInput })),
    Match.exhaustive,
  )

const decideFromNonStandardExit = (stderr: string): HookDecision =>
  Match.value(spokenStderr(stderr)).pipe(
    Match.tag('Some', (some) => new Warning({ message: some.value })),
    Match.tag('None', () => new Allow({})),
    Match.exhaustive,
  )

export const interpretHookResult = (
  cmd: InterpretHookCommand,
): Either.Either<HookDecision, HookVerdictError> =>
  Match.value(classifyResult(cmd.result)).pipe(
    Match.tag('ExitBlock', () => Either.right(new Block({ reason: blockReason(cmd.result.stderr, cmd.event) }))),
    Match.tag('ExitNoDecision', () => Either.right(new Allow({}))),
    Match.tag('ExitDecisionJson', () =>
      Either.match(parseHookOutput(cmd.result.stdout), {
        onLeft: () => Either.left(new HookVerdictError({ raw: cmd.result.stdout })),
        onRight: (parsed) => Either.right(decideFromParsed(parsed, cmd.event)),
      })),
    Match.tag('ExitOther', () => Either.right(decideFromNonStandardExit(cmd.result.stderr))),
    Match.exhaustive,
  )
