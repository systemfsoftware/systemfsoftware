import type { Problem } from '@systemfsoftware/arethetypeswrong-core'

import { ComputeExitCodeCommand, ComputeExitCodeDecision } from './GetExitCode.schema.js'
import { problemFlagForKind } from './ProblemUtils.js'

const isVisibleProblem = (
  problem: Problem,
  ignoredRules: ReadonlySet<string>,
  ignoredResolutions: ReadonlySet<string>,
): boolean => {
  const ruleIgnored = ignoredRules.has(problemFlagForKind(problem.kind))
  const resolutionIgnored = 'resolutionKind' in problem && ignoredResolutions.has(problem.resolutionKind)
  return !ruleIgnored && !resolutionIgnored
}

export const computeExitCode = (command: ComputeExitCodeCommand): ComputeExitCodeDecision => {
  const result = command.result
  if (result.types === false) {
    return new ComputeExitCodeDecision({ exitCode: 0 })
  }
  const ignoredRules = new Set<string>(command.ignoreRules)
  const ignoredResolutions = new Set<string>(command.ignoreResolutions)
  const hasVisibleProblem = result.problems.some((p) => isVisibleProblem(p, ignoredRules, ignoredResolutions))
  return new ComputeExitCodeDecision({ exitCode: hasVisibleProblem ? 1 : 0 })
}
