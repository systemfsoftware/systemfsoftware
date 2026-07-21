import { Either, Match, Schema as S } from 'effect'
import { Allow, Block, Warning } from './hook-dispatcher.schema.js'
import type { HookDecision, HookResult } from './hook-dispatcher.schema.js'
import { parseHookOutput } from './hook-output.acl.js'
import type { ParsedHookOutput } from './hook-output.acl.js'

// Error channel — hook exited 0 but stdout was not parseable JSON
export class HookVerdictError extends S.TaggedError<HookVerdictError>()('HookVerdictError', {
  raw: S.String,
}) {}

// Internal closed union over the three exit-code categories (primitive
// dispatch needs a closed shape for Match.exhaustive to bite).
class ExitBlock extends S.TaggedClass<ExitBlock>()('ExitBlock', {}) {}
class ExitParse extends S.TaggedClass<ExitParse>()('ExitParse', {}) {}
class ExitOther extends S.TaggedClass<ExitOther>()('ExitOther', {}) {}

const ExitKind = S.Union(ExitBlock, ExitParse, ExitOther)
type ExitKind = S.Schema.Type<typeof ExitKind>

const classifyExit = (code: number): ExitKind =>
  Match.value(code).pipe(
    Match.when(2, () => new ExitBlock({})),
    Match.when(0, () => new ExitParse({})),
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
    Match.orElse(() => new Allow({})),
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
  Match.value(classifyExit(result.code)).pipe(
    Match.tag('ExitBlock', () => Either.right(new Block({ reason: blockReason(result.stderr, event) }))),
    Match.tag('ExitParse', () =>
      Either.match(parseHookOutput(result.stdout), {
        onLeft: () => Either.left(new HookVerdictError({ raw: result.stdout })),
        onRight: (parsed) => Either.right(decideFromParsed(parsed, event)),
      })),
    Match.tag('ExitOther', () => Either.right(decideFromNonStandardExit(result.stderr))),
    Match.exhaustive,
  )
