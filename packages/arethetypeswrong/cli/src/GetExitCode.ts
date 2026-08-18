/// <reference types="vitest/import-meta" />
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

if (import.meta.vitest !== void 0) {
  const { describe, expect, it } = import.meta.vitest

  // Only four problem kinds carry a `resolutionKind`; the rest cannot be
  // silenced by resolution at all. The fixtures below are real values of the
  // core's own schema, so a test can never assert on a shape it cannot produce.
  const moduleKind = { detectedKind: 1, detectedReason: 'extension', reasonFileName: '/index.js' } as const
  const noResolution = (resolutionKind: 'node10' | 'node16-cjs' | 'node16-esm' | 'bundler'): Problem => ({
    kind: 'NoResolution',
    entrypoint: '.',
    resolutionKind,
  })
  const falseCjs = (stem: string): Problem => ({
    kind: 'FalseCJS',
    typesFileName: `/${stem}.d.ts`,
    implementationFileName: `/${stem}.js`,
    typesModuleKind: moduleKind,
    implementationModuleKind: moduleKind,
  })
  const falseEsm = (stem: string): Problem => ({
    kind: 'FalseESM',
    typesFileName: `/${stem}.d.mts`,
    implementationFileName: `/${stem}.mjs`,
    typesModuleKind: moduleKind,
    implementationModuleKind: moduleKind,
  })
  const namedExports = (stem: string): Problem => ({
    kind: 'NamedExports',
    typesFileName: `/${stem}.d.ts`,
    implementationFileName: `/${stem}.js`,
    isMissingAllNamed: false,
    missing: ['a'],
  })

  const exitCodeFor = (
    problems: readonly Problem[],
    options: { ignoreRules?: readonly string[]; ignoreResolutions?: readonly string[] } = {},
  ): number =>
    computeExitCode(
      new ComputeExitCodeCommand({
        result: {
          packageName: 'pkg',
          packageVersion: '1.0.0',
          buildTools: {},
          types: { kind: 'included' },
          entrypoints: {},
          programInfo: { bundler: {}, node10: {}, node16: {} },
          problems,
        },
        ignoreRules: [...(options.ignoreRules ?? [])],
        ignoreResolutions: [...(options.ignoreResolutions ?? [])],
      }),
    ).exitCode

  describe('computeExitCode', () => {
    it('Should_Return0_When_ThePackageIsUntyped', () => {
      const command = new ComputeExitCodeCommand({
        result: { packageName: 'pkg', packageVersion: '1.0.0', types: false },
        ignoreRules: ['no-resolution', 'false-cjs'],
        ignoreResolutions: ['node10'],
      })
      expect(computeExitCode(command).exitCode).toBe(0)
    })

    it('Should_Return0_When_TypedWithNoProblems', () => {
      expect(exitCodeFor([])).toBe(0)
    })

    it('Should_Return1_When_TheOnlyProblemIsNoResolution', () => {
      expect(exitCodeFor([noResolution('node10')])).toBe(1)
    })

    it('Should_Return1_When_NoResolutionCoexistsWithAnotherKind', () => {
      expect(exitCodeFor([noResolution('node10'), falseCjs('index')])).toBe(1)
    })

    it('Should_Return1_When_OneOtherKindIsPresent', () => {
      expect(exitCodeFor([falseCjs('index')])).toBe(1)
    })

    it('Should_Return1_When_SeveralDistinctKindsArePresent', () => {
      expect(exitCodeFor([falseCjs('a'), falseEsm('b'), namedExports('c')])).toBe(1)
    })

    it('Should_Return1_When_DuplicateProblemsOfOneKindArePresent', () => {
      expect(exitCodeFor([falseCjs('a'), falseCjs('b')])).toBe(1)
    })

    it('Should_Return0_When_EveryKindIsIgnoredByFlag', () => {
      expect(exitCodeFor([falseCjs('index')], { ignoreRules: ['false-cjs'] })).toBe(0)
    })

    it('Should_Return1_When_TheIgnoreListNamesTheKindInsteadOfTheFlag', () => {
      expect(exitCodeFor([falseCjs('index')], { ignoreRules: ['FalseCJS'] })).toBe(1)
    })

    it('Should_Return0_When_TheOnlyProblemIsIgnoredByResolution', () => {
      expect(exitCodeFor([noResolution('node10')], { ignoreResolutions: ['node10'] })).toBe(0)
    })

    it('Should_Return1_When_TheIgnoredResolutionCoexistsWithAVisibleOne', () => {
      expect(exitCodeFor([noResolution('node10'), noResolution('bundler')], { ignoreResolutions: ['node10'] }))
        .toBe(1)
    })

    it('Should_Return1_When_TheProblemKindCarriesNoResolutionKind', () => {
      expect(exitCodeFor([falseCjs('index')], { ignoreResolutions: ['node10'] })).toBe(1)
    })
  })
}
