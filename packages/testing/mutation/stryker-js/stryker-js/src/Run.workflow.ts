import { Wire, Workflow } from '@systemfsoftware/effect-cell-types'
import * as Result from 'effect/Result'
import * as S from 'effect/Schema'

export class PlanMutationRunCommand extends S.TaggedClass<PlanMutationRunCommand>()('PlanMutationRunCommand', {
  configMutatePatterns: Wire.mint(S.Array(Wire.mint(S.String))),
  configMutatorNames: Wire.mint(S.Array(Wire.mint(S.String))),
  targetMutatePatterns: Wire.mint(S.Array(Wire.mint(S.String))),
  availableMutators: Wire.mint(S.Array(Wire.mint(S.String))),
}) {}

export class MutationRunPlan extends S.TaggedClass<MutationRunPlan>()('MutationRunPlan', {
  mutatePatterns: Wire.mint(S.Array(Wire.mint(S.String))),
  mutatorNames: Wire.mint(S.Array(Wire.mint(S.String))),
}) {}

export class PlanMutationRunError extends S.TaggedError<PlanMutationRunError>()('PlanMutationRunError', {
  message: S.String,
  detail: S.String,
}) {}

const selectMutatePatterns = (
  target: ReadonlyArray<string>,
  fallback: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (target.length > 0) {
    return [...target]
  }
  return [...fallback]
}

const selectMutatorNames = (
  available: ReadonlyArray<string>,
  fallback: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (available.length > 0) {
    return [...available]
  }
  return [...fallback]
}

const decidePlan = (command: PlanMutationRunCommand): Result.Result<MutationRunPlan, PlanMutationRunError> => {
  const mutatePatterns = selectMutatePatterns(command.targetMutatePatterns, command.configMutatePatterns)
  const mutatorNames = selectMutatorNames(command.availableMutators, command.configMutatorNames)
  return Result.succeed(
    MutationRunPlan.make({
      mutatePatterns,
      mutatorNames,
    }),
  )
}

export const planMutationRun = Workflow.make(
  PlanMutationRunCommand,
  (command: PlanMutationRunCommand): Result.Result<MutationRunPlan, PlanMutationRunError> => decidePlan(command),
)
