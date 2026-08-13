import * as S from 'effect/Schema'

import type { Analysis, CheckResult, Problem } from '@systemfsoftware/arethetypeswrong-core'

import { problemFlagForKind } from './problem-utils.kernel.js'

export class ComputeExitCodeCommand extends S.TaggedClass<ComputeExitCodeCommand>()('ComputeExitCodeCommand', {
  result: S.Unknown,
  ignoreRules: S.Array(S.String),
  ignoreResolutions: S.Array(S.String),
}) {}

export class ComputeExitCodeDecision extends S.TaggedClass<ComputeExitCodeDecision>()('ComputeExitCodeDecision', {
  exitCode: S.Number,
}) {}

const isVisibleProblem = (
  problem: Problem,
  ignoredRules: ReadonlySet<string>,
  ignoredResolutions: ReadonlySet<string>,
): boolean => {
  const ruleIgnored = ignoredRules.has(problemFlagForKind(problem.kind))
  const resolutionIgnored = 'resolutionKind' in problem && ignoredResolutions.has(problem.resolutionKind as string)
  return !ruleIgnored && !resolutionIgnored
}

export const computeExitCode = (command: ComputeExitCodeCommand): ComputeExitCodeDecision => {
  const result = command.result as CheckResult
  if (!result.types) {
    return new ComputeExitCodeDecision({ exitCode: 0 })
  }
  const analysis = result as Analysis
  const ignoredRules = new Set<string>(command.ignoreRules)
  const ignoredResolutions = new Set<string>(command.ignoreResolutions)
  const hasVisibleProblem = analysis.problems.some((p) => isVisibleProblem(p, ignoredRules, ignoredResolutions))
  return new ComputeExitCodeDecision({ exitCode: hasVisibleProblem ? 1 : 0 })
}
