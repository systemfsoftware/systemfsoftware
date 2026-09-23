import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

import { DecisionError, WideDecision, WideOne } from './Decision.schema.js'

/**
 * The command the wide-decision scale measurement decides on: twelve decision variants plus
 * the error variant and the rejection envelope make a fifteen-key handler record.
 */
export class WideCommand extends S.TaggedClass<WideCommand>()('WideCommand', {
  n: S.Int,
}) {
  static readonly [Workflow.InstrumentationBrand] = ['n'] as const
}

export const admitWideCommand = Workflow.make({
  command: WideCommand,
  decision: WideDecision,
  error: DecisionError,
  decide: (command: WideCommand): Result.Result<WideOne, DecisionError> =>
    Result.succeed(new WideOne({ n: command.n })),
})
