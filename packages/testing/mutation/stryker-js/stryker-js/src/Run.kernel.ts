import { MutationRunPlan, type PlanMutationRunCommand } from './Run.schema.js'

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

export const planMutationRun = (command: PlanMutationRunCommand): MutationRunPlan =>
  MutationRunPlan.make({
    mutatePatterns: selectMutatePatterns(command.targetMutatePatterns, command.configMutatePatterns),
    mutatorNames: selectMutatorNames(command.availableMutators, command.configMutatorNames),
  })
