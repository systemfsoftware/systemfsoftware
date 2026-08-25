import { Mutant } from '@systemfsoftware/stryker-js/Mutant'
import { type StrykerOptions, StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import type { DryRunOptions, MutantRunOptions } from '@systemfsoftware/stryker-js/TestRunner'
import * as S from 'effect/Schema'

export interface VitestRunnerOptions {
  dir?: string
  related?: boolean
  configFile?: string
}

export interface VitestRunnerOptionsWithStrykerOptions extends StrykerOptions {
  vitest: VitestRunnerOptions
}

// Fixture: constructing the default options document where throwing is the assertion — no Effect channel exists.
const fillStrykerDefaults = (): StrykerOptions => S.decodeSync(StrykerOptionsSchema)({})

export function createVitestRunnerOptions(
  overrides?: Partial<VitestRunnerOptions>,
): VitestRunnerOptions {
  return {
    related: true,
    ...overrides,
  }
}
export function createStrykerOptions(
  overrides?: Partial<VitestRunnerOptionsWithStrykerOptions>,
): VitestRunnerOptionsWithStrykerOptions {
  return {
    ...fillStrykerDefaults(),
    vitest: createVitestRunnerOptions(),
    ...overrides,
  }
}

export function createMutant(overrides?: Partial<Mutant>): Mutant {
  return new Mutant({
    id: '42',
    fileName: 'file',
    mutatorName: 'foobarMutator',
    location: {
      start: { line: 0, column: 0 },
      end: { line: 0, column: 0 },
    },
    replacement: 'replacement',
    ...overrides,
  })
}

export function createDryRunOptions(
  overrides?: Partial<DryRunOptions>,
): DryRunOptions {
  return {
    coverageAnalysis: 'off',
    timeout: 2000,
    disableBail: false,
    ...overrides,
  }
}

export function createMutantRunOptions(
  overrides?: Partial<MutantRunOptions>,
): MutantRunOptions {
  return {
    activeMutant: createMutant(),
    timeout: 2000,
    sandboxFileName: '.stryker-tmp/sandbox123/file',
    disableBail: false,
    mutantActivation: 'static',
    reloadEnvironment: false,
    ...overrides,
  }
}
