import { Workflow } from '@systemfsoftware/effect-cell-types'
import { Match, Option, Result, Schema as S } from 'effect'
import { HookResult } from './hooks.schema.js'
import { ParsedHookOutputSchema } from './hooks.schema.js'

export type ExitKind = 'ExitBlock' | 'ExitDecisionJson' | 'ExitNoDecision' | 'ExitOther'

const exitKindOf = (code: number, stdout: string): ExitKind => {
  if (code === 2) return 'ExitBlock'
  if (code !== 0) return 'ExitOther'
  return stdout.trim().startsWith('{') ? 'ExitDecisionJson' : 'ExitNoDecision'
}

const blockReason = (stderr: string, event: string): string => {
  const spoken = stderr.trim()
  return spoken === '' ? `Blocked by ${event} hook` : spoken
}

export type StderrVerdict = 'warning' | 'allow'

const stderrVerdict = (stderr: string): StderrVerdict => (stderr.trim() === '' ? 'allow' : 'warning')

const spokenStderr = (stderr: string): string => stderr.trim()

export type ParsedVerdict = 'block' | 'allow'

const parsedVerdict = (permissionDecision: string | undefined, decision: string | undefined): ParsedVerdict => {
  const key = permissionDecision ?? decision
  return key === 'deny' || key === 'block' ? 'block' : 'allow'
}

const parsedBlockReason = (
  permissionDecision: string | undefined,
  permissionDecisionReason: string | undefined,
  reason: string | undefined,
  event: string,
): string => {
  const stated = permissionDecision === 'deny' ? permissionDecisionReason : reason
  return stated === undefined || stated.trim() === '' ? `Blocked by ${event} hook` : stated
}

const HookVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/HookVerdict')
type HookVerdictTypeId = typeof HookVerdictTypeId

export class Block extends S.TaggedClass<Block>()('Block', {
  reason: S.String,
  code: S.Number,
  stdout: S.String,
}) {
  readonly [HookVerdictTypeId] = HookVerdictTypeId
}

export class Allow extends S.TaggedClass<Allow>()(
  'Allow',
  {
    updatedInput: S.optional(S.Record(S.String, S.Unknown)),
    code: S.Number,
    stdout: S.String,
  },
) {
  readonly [HookVerdictTypeId] = HookVerdictTypeId
}

export class Warning extends S.TaggedClass<Warning>()('Warning', {
  message: S.String,
  code: S.Number,
  stdout: S.String,
}) {
  readonly [HookVerdictTypeId] = HookVerdictTypeId
}

export const HookDecision = S.Union([Block, Allow, Warning])
export type HookDecision = S.Schema.Type<typeof HookDecision>

const InterpretHookCommandTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/InterpretHookCommand')
type InterpretHookCommandTypeId = typeof InterpretHookCommandTypeId

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

const HookVerdictFailure = S.TaggedStruct('HookVerdictFailure', {
  error: HookVerdictError,
  code: S.Finite,
  stdout: S.String,
})
export type HookVerdictFailure = S.Schema.Type<typeof HookVerdictFailure>

export const interpretHookResult = Workflow.make(
  InterpretHookCommand,
  (command): Result.Result<HookDecision, HookVerdictFailure> => {
    const { code, stdout } = command.result
    return Result.mapBoth(
      Match.value(exitKindOf(code, stdout)).pipe(
        Match.when(
          'ExitBlock',
          () =>
            Result.succeed(
              new Block({ reason: blockReason(command.result.stderr, command.event), code, stdout }),
            ),
        ),
        Match.when('ExitNoDecision', () => Result.succeed(new Allow({ code, stdout }))),
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
                      code,
                      stdout,
                    }),
                  )),
                Match.when('allow', () =>
                  Result.succeed(
                    new Allow({ updatedInput: parsed.hookSpecificOutput?.updatedInput, code, stdout }),
                  )),
                Match.exhaustive,
              ),
          })),
        Match.when('ExitOther', () =>
          Match.value(stderrVerdict(command.result.stderr)).pipe(
            Match.when(
              'warning',
              () => Result.succeed(new Warning({ message: spokenStderr(command.result.stderr), code, stdout })),
            ),
            Match.when('allow', () => Result.succeed(new Allow({ code, stdout }))),
            Match.exhaustive,
          )),
        Match.exhaustive,
      ),
      {
        onFailure: (error) => HookVerdictFailure.make({ error, code, stdout }),
        onSuccess: (verdict) => verdict,
      },
    )
  },
)
