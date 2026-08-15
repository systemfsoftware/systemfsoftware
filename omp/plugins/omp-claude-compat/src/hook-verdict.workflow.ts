import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as S from 'effect/Schema'
import { Allow, Block, HookResult, Warning } from './hook-dispatcher.schema.js'
import type { HookDecision } from './hook-dispatcher.schema.js'
import { parseHookOutput } from './hook-output.acl.js'
import {
  blockReason,
  exitKindOf,
  parsedBlockReason,
  parsedVerdict,
  spokenStderr,
  stderrVerdict,
} from './hook-verdict.kernel.js'

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
  (command: InterpretHookCommand): Either.Either<HookDecision, HookVerdictError> =>
    Match.value(exitKindOf(command.result.code, command.result.stdout)).pipe(
      Match.when(
        'ExitBlock',
        () => Either.right(new Block({ reason: blockReason(command.result.stderr, command.event) })),
      ),
      Match.when('ExitNoDecision', () => Either.right(new Allow({}))),
      Match.when('ExitDecisionJson', () =>
        Either.match(parseHookOutput(command.result.stdout), {
          onLeft: () => Either.left(new HookVerdictError({ raw: command.result.stdout })),
          onRight: (parsed) =>
            Match.value(parsedVerdict(parsed.hookSpecificOutput?.permissionDecision, parsed.decision)).pipe(
              Match.when('block', () =>
                Either.right(
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
                Either.right(new Allow({ updatedInput: parsed.hookSpecificOutput?.updatedInput }))),
              Match.exhaustive,
            ),
        })),
      Match.when('ExitOther', () =>
        Match.value(stderrVerdict(command.result.stderr)).pipe(
          Match.when('warning', () => Either.right(new Warning({ message: spokenStderr(command.result.stderr) }))),
          Match.when('allow', () => Either.right(new Allow({}))),
          Match.exhaustive,
        )),
      Match.exhaustive,
    ),
)
