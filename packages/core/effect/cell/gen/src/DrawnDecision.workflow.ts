import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

/**
 * The decision error the drawn descriptions carry. Tagged — via the schema, so no manual
 * `_tag` is declared — because the branded `Workflow.make` demands a tagged error channel
 * on the decide run it wraps, with the drawn failure code as its payload so the routing
 * properties can still compare payloads numerically.
 */
export class DrawnDecisionError extends S.TaggedError<DrawnDecisionError>()('DrawnDecisionError', {
  code: S.Finite,
}) {}

export interface DrawnInjection {
  readonly injected: boolean
  readonly error: number
}

/**
 * The drawn command. `Workflow.make` constrains its first argument to a real schema
 * class, so the generated descriptions carry one instead of a bare `number` — the
 * drawn value now travels as a field rather than as the whole command.
 */
export class DrawnCommand extends S.TaggedClass<DrawnCommand>()('DrawnCommand', {
  value: S.Int,
}) {}

/**
 * The drawn decide run: a branded `Workflow.make` value whose body closes only over its
 * parameters, so the failure injection is decided before the boundary and the body stays
 * one exhaustive path.
 */
export const drawnDecision = (trace: string[], phaseName: string, injection: DrawnInjection) =>
  Workflow.make(DrawnCommand, (command): Result.Result<number, DrawnDecisionError> => {
    trace.push(phaseName)
    return Match.value({ injected: injection.injected, value: command.value } as const).pipe(
      Match.when({ injected: true }, () => Result.fail(DrawnDecisionError.make({ code: injection.error }))),
      Match.orElse(({ value }) => Result.succeed(value)),
    )
  })
