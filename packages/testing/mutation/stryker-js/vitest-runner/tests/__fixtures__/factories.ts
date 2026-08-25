import * as S from 'effect/Schema'
import { vi } from 'vitest'

import { type Mutant, type StrykerOptions, StrykerOptionsSchema } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import type { DryRunOptions, MutantRunOptions } from '@systemfsoftware/stryker-js-plugin-api/test-runner'

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

export function createLogger(): Logger {
  return {
    debug: vi.fn<(message: string, ...args: readonly unknown[]) => void>(),
    error: vi.fn<(message: string, ...args: readonly unknown[]) => void>(),
    fatal: vi.fn<(message: string, ...args: readonly unknown[]) => void>(),
    info: vi.fn<(message: string, ...args: readonly unknown[]) => void>(),
    isDebugEnabled: () => false,
    isErrorEnabled: () => false,
    isFatalEnabled: () => false,
    isInfoEnabled: () => false,
    isTraceEnabled: () => false,
    isWarnEnabled: () => false,
    trace: vi.fn<(message: string, ...args: readonly unknown[]) => void>(),
    warn: vi.fn<(message: string, ...args: readonly unknown[]) => void>(),
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
  return {
    id: '42',
    fileName: 'file',
    mutatorName: 'foobarMutator',
    location: {
      start: { line: 0, column: 0 },
      end: { line: 0, column: 0 },
    },
    replacement: 'replacement',
    ...overrides,
  }
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
