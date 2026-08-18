import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Exit from 'effect/Exit'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'
import { Allow, Block, HookResult, Warning } from './HookDispatcher.schema.js'
import type { HookDecision } from './HookDispatcher.schema.js'
import { parseHookOutput } from './HookOutput.js'
import {
  blockReason,
  exitKindOf,
  parsedBlockReason,
  parsedVerdict,
  spokenStderr,
  stderrVerdict,
} from './HookVerdict.js'

const InterpretHookCommandTypeId: unique symbol = Symbol.for('@systemfsoftware/omp-claude-compat/InterpretHookCommand')
type InterpretHookCommandTypeId = typeof InterpretHookCommandTypeId

export class InterpretHookCommand extends S.TaggedClass<InterpretHookCommand>()('InterpretHookCommand', {
  result: HookResult,
  event: S.String,
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

export const interpretHookResult = Workflow.make(
  (command: InterpretHookCommand): Result.Result<HookDecision, HookVerdictError> =>
    Match.value(exitKindOf(command.result.code, command.result.stdout)).pipe(
      Match.when(
        'ExitBlock',
        () => Result.succeed(new Block({ reason: blockReason(command.result.stderr, command.event) })),
      ),
      Match.when('ExitNoDecision', () => Result.succeed(new Allow({}))),
      Match.when('ExitDecisionJson', () =>
        Exit.match(parseHookOutput(command.result.stdout), {
          onFailure: () => Result.fail(new HookVerdictError({ raw: command.result.stdout })),
          onSuccess: (parsed) =>
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
)
