import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Result, Schema as S } from 'effect'
import { HookResult } from './hooks.schema.js'
import { ParsedHookOutputSchema } from './hooks.schema.js'

/**
 * The pure decisions behind the hook verdict.
 *
 * This file holds the decision and everything it references: the primitive
 * helpers it reads (`exitKindOf`, `blockReason`, …) and the verdict classes it
 * constructs (`Block`, `Allow`, `Warning`, `HookDecision`) live beside the
 * make, because a `Workflow.make` body may reference only declarations in this
 * same file. Decoding is the shell's job — the run wraps the raw result and
 * the already-decoded stdout together into `InterpretHookCommand`, and the
 * decision refuses the decode (a malformed decision object becomes
 * `HookVerdictError`) rather than decoding.
 */

/** How Claude Code reads a hook's exit code and stdout. */
export type ExitKind = 'ExitBlock' | 'ExitDecisionJson' | 'ExitNoDecision' | 'ExitOther'

/**
 * Exit 0 is success. Claude Code parses stdout for a decision object and otherwise treats
 * the output as non-decision text - blank, a status line, a debug echo. Only output opening
 * with `{` claims to be a decision, so only that shape can be malformed.
 */
const exitKindOf = (code: number, stdout: string): ExitKind => {
  if (code === 2) return 'ExitBlock'
  if (code !== 0) return 'ExitOther'
  return stdout.trim().startsWith('{') ? 'ExitDecisionJson' : 'ExitNoDecision'
}

/** What a blocking hook says, or a stated fallback when it says nothing. */
const blockReason = (stderr: string, event: string): string => {
  const spoken = stderr.trim()
  return spoken === '' ? `Blocked by ${event} hook` : spoken
}

/** Whether a non-standard exit spoke on stderr, and so warrants a warning over an allow. */
export type StderrVerdict = 'warning' | 'allow'

const stderrVerdict = (stderr: string): StderrVerdict => (stderr.trim() === '' ? 'allow' : 'warning')

/** What a non-standard exit said, trimmed. Empty when it said nothing. */
const spokenStderr = (stderr: string): string => stderr.trim()

/** Which decision a parsed hook output claims, read from its two decision keys. */
export type ParsedVerdict = 'block' | 'allow'

const parsedVerdict = (permissionDecision: string | undefined, decision: string | undefined): ParsedVerdict => {
  const key = permissionDecision ?? decision
  return key === 'deny' || key === 'block' ? 'block' : 'allow'
}

/**
 * The reason a parsed block carries: the key's own reason field, or the stated fallback.
 *
 * `deny` states its reason in `permissionDecisionReason` and `block` in `reason`, so the
 * workflow reads both off the parsed value and this picks whichever the key implies.
 *
 * A blank reason counts as absent. `??` alone guards only nullish, so a hook emitting
 * `"reason": ""` produced a block with no explanation at all. Blankness is decided on the
 * trimmed value and the reason is returned verbatim, because the hook's own words - spacing
 * included - are what the user sees.
 */
const parsedBlockReason = (
  permissionDecision: string | undefined,
  permissionDecisionReason: string | undefined,
  reason: string | undefined,
  event: string,
): string => {
  const stated = permissionDecision === 'deny' ? permissionDecisionReason : reason
  return stated === undefined || stated.trim() === '' ? `Blocked by ${event} hook` : stated
}

/**
 * The verdict a hook exit returns, as the decision's own wire: the tagged
 * classes move across the Cell phases, so the reader imports the workflow —
 * never the reverse. The run's raw wire (`HookResult`) and the run outcome
 * (`HookOutcome`) stay in `HookDispatcher.schema.ts`; these are the verdict,
 * not the run.
 */
export class Block extends S.TaggedClass<Block>()('Block', { reason: S.String }) {}

export class Allow extends S.TaggedClass<Allow>()(
  'Allow',
  { updatedInput: S.optional(S.Record(S.String, S.Unknown)) },
) {}

export class Warning extends S.TaggedClass<Warning>()('Warning', { message: S.String }) {}

export const HookDecision = S.Union([Block, Allow, Warning])
export type HookDecision = S.Schema.Type<typeof HookDecision>

const InterpretHookCommandTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/InterpretHookCommand')
type InterpretHookCommandTypeId = typeof InterpretHookCommandTypeId

/**
 * The decision's input, gathered at the edge: the run's raw result plus the
 * already-decoded stdout. `parsed` carries the decode's outcome as data —
 * `None` when stdout never decoded to a decision object — so the decision
 * refuses a malformed decision object instead of decoding, because decoding
 * is the shell's job (see the `decode` phase in the hook run chain).
 */
export class InterpretHookCommand extends S.TaggedClass<InterpretHookCommand>()('InterpretHookCommand', {
  result: HookResult,
  event: S.String,
  parsed: S.Option(ParsedHookOutputSchema),
}) {
  readonly [InterpretHookCommandTypeId] = InterpretHookCommandTypeId
}

const HookVerdictErrorTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/HookVerdictError')
type HookVerdictErrorTypeId = typeof HookVerdictErrorTypeId

export class HookVerdictError extends S.TaggedError<HookVerdictError>()('HookVerdictError', {
  raw: S.String,
}) {
  readonly [HookVerdictErrorTypeId] = HookVerdictErrorTypeId
}

export interface HookVerdictDecision {
  readonly verdict: HookDecision
  readonly code: number
  readonly stdout: string
}

const HookVerdictFailure = S.TaggedStruct('HookVerdictFailure', {
  error: HookVerdictError,
  code: S.Finite,
  stdout: S.String,
})
export type HookVerdictFailure = S.Schema.Type<typeof HookVerdictFailure>

export const interpretHookResult = Workflow.make(
  InterpretHookCommand,
  (command): Result.Result<HookVerdictDecision, HookVerdictFailure> => {
    const { code, stdout } = command.result
    return Result.mapBoth(
      Match.value(exitKindOf(code, stdout)).pipe(
        Match.when(
          'ExitBlock',
          () => Result.succeed(new Block({ reason: blockReason(command.result.stderr, command.event) })),
        ),
        Match.when('ExitNoDecision', () => Result.succeed(new Allow({}))),
        Match.when('ExitDecisionJson', () =>
          Option.match(command.parsed, {
            onNone: () => Result.fail(new HookVerdictError({ raw: stdout })),
            onSome: (parsed) =>
              Match.value(parsedVerdict(parsed.hookSpecificOutput?.permissionDecision, parsed.decision)).pipe(
                Match.when('block', () =>
                  Result.succeed(
                    new Block({
                      reason: parsedBlockReason(
                        parsed.hookSpecificOutput?.permissionDecision,
                        parsed.hookSpecificOutput?.permissionDecisionReason,
                        parsed.reason,
                        command.event,
                      ),
                    }),
                  )),
                Match.when('allow', () =>
                  Result.succeed(new Allow({ updatedInput: parsed.hookSpecificOutput?.updatedInput }))),
                Match.exhaustive,
              ),
          })),
        Match.when('ExitOther', () =>
          Match.value(stderrVerdict(command.result.stderr)).pipe(
            Match.when('warning', () => Result.succeed(new Warning({ message: spokenStderr(command.result.stderr) }))),
            Match.when('allow', () => Result.succeed(new Allow({}))),
            Match.exhaustive,
          )),
        Match.exhaustive,
      ),
      {
        onFailure: (error) => HookVerdictFailure.make({ error, code, stdout }),
        onSuccess: (verdict) => ({ verdict, code, stdout }),
      },
    )
  },
)
