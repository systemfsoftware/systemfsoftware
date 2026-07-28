import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'
import { Allow, Block, Warning } from './hook-dispatcher.schema.js'
import type { HookDecision, HookResult } from './hook-dispatcher.schema.js'
import { parseHookOutput } from './hook-output.acl.js'
import type { ParsedHookOutput } from './hook-output.acl.js'

// Error channel — hook exited 0 and its stdout opened with `{`, claiming to
// be a decision object, but the object did not parse.
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
const classifyExitZero = (stdout: string): ExitKind =>
  Match.value(stdout.trim()).pipe(
    Match.when((trimmed: string) => trimmed.startsWith('{'), () => new ExitDecisionJson({})),
    Match.orElse(() => new ExitNoDecision({})),
  )

const classifyResult = (result: HookResult): ExitKind =>
  Match.value(result.code).pipe(
    Match.when(2, () => new ExitBlock({})),
    Match.when(0, () => classifyExitZero(result.stdout)),
    Match.orElse(() => new ExitOther({})),
  )

const blockReason = (stderr: string, event: string): string =>
  Match.value(stderr.trim()).pipe(
    Match.when('', () => `Blocked by ${event} hook`),
    Match.orElse((trimmed) => trimmed),
  )

const decideFromParsed = (parsed: ParsedHookOutput, event: string): HookDecision =>
  Match.value(parsed.hookSpecificOutput?.permissionDecision ?? parsed.decision).pipe(
    Match.when('deny', () =>
      new Block({
        reason: parsed.hookSpecificOutput?.permissionDecisionReason ?? `Blocked by ${event} hook`,
      })),
    Match.when('block', () =>
      new Block({
        reason: parsed.reason ?? `Blocked by ${event} hook`,
      })),
    Match.orElse(() => new Allow({ updatedInput: parsed.hookSpecificOutput?.updatedInput })),
  )

const decideFromNonStandardExit = (stderr: string): HookDecision =>
  Match.value(stderr.trim()).pipe(
    Match.when('', () => new Allow({})),
    Match.orElse((message) => new Warning({ message })),
  )

export const interpretHookResult = (
  result: HookResult,
  event: string,
): Either.Either<HookDecision, HookVerdictError> =>
  Match.value(classifyResult(result)).pipe(
    Match.tag('ExitBlock', () => Either.right(new Block({ reason: blockReason(result.stderr, event) }))),
    Match.tag('ExitNoDecision', () => Either.right(new Allow({}))),
    Match.tag('ExitDecisionJson', () =>
      Either.match(parseHookOutput(result.stdout), {
        onLeft: () => Either.left(new HookVerdictError({ raw: result.stdout })),
        onRight: (parsed) => Either.right(decideFromParsed(parsed, event)),
      })),
    Match.tag('ExitOther', () => Either.right(decideFromNonStandardExit(result.stderr))),
    Match.exhaustive,
  )
