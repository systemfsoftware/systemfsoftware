import { MutationRunPlan, type PlanMutationRunCommand } from './Run.schema.js'

const firstNonEmpty = (
  preferred: ReadonlyArray<string>,
  fallback: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  if (preferred.length > 0) {
    return [...preferred]
  }
  return [...fallback]
}

export const planMutationRun = (command: PlanMutationRunCommand): MutationRunPlan =>
  MutationRunPlan.make({
    mutatePatterns: firstNonEmpty(command.targetMutatePatterns, command.configMutatePatterns),
    mutatorNames: firstNonEmpty(command.availableMutators, command.configMutatorNames),
  })
