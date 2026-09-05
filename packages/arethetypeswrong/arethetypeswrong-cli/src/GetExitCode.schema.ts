import { CheckResultSchema } from '@systemfsoftware/arethetypeswrong'
import * as S from 'effect/Schema'

/**
 * The exit-code decision's input. `result` is the core's own `CheckResult`, not
 * an opaque payload: the decision reads `types` and `problems` off it, so the
 * shape it relies on is stated here and a mismatch fails at the boundary.
 */
export class ComputeExitCodeCommand extends S.TaggedClass<ComputeExitCodeCommand>()('ComputeExitCodeCommand', {
  result: CheckResultSchema,
  ignoreRules: S.Array(S.String),
  ignoreResolutions: S.Array(S.String),
}) {}

export class ComputeExitCodeDecision extends S.TaggedClass<ComputeExitCodeDecision>()('ComputeExitCodeDecision', {
  exitCode: S.Number,
}) {}
