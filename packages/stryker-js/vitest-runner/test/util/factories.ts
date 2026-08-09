import ajvModule from 'ajv'
import { vi } from 'vitest'
import type { RunnerTestCase, RunnerTestFile, RunnerTestSuite, Vitest } from 'vitest/node'

import type { Mutant, StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { strykerCoreSchema } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { Logger } from '@systemfsoftware/stryker-js-plugin-api/logging'
import { commonTokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type { DryRunOptions, MutantRunOptions } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { createInjector } from 'typed-inject'

import type {
  VitestRunnerOptions,
  VitestRunnerOptionsWithStrykerOptions,
} from '../../src/vitest-runner-options-with-stryker-options.js'

type ResolvedConfig = Vitest['config']
type ResolvedBrowserOptions = ResolvedConfig['browser']

const Ajv = ajvModule.default
const ajv = new Ajv({ useDefaults: true, strict: false })
const validateStrykerOptions = ajv.compile(strykerCoreSchema)

// Fills in every Stryker option default registered in the schema, so the options factory
// returns a complete StrykerOptions instead of hand-copying ~45 schema defaults that rot.
function fillStrykerDefaults(
  options: Partial<StrykerOptions>,
): asserts options is StrykerOptions {
  if (!validateStrykerOptions(options)) {
    throw new Error(
      `Unknown stryker options ${ajv.errorsText(validateStrykerOptions.errors)}`,
    )
  }
}

export function createVitestMock(): Vitest {
  return {
    config: {
      browser: {
        enabled: false,
        headless: false,
      } as ResolvedBrowserOptions,
    } as ResolvedConfig,
    state: {
      filesMap: new Map(),
      getFiles: () => [] as RunnerTestFile[],
      errorsSet: new Set(),
    },
    projects: [] as Vitest['projects'],
    start: vi.fn(),
    provide: vi.fn(),
    // A double for vitest's own Vitest class: the runner touches only the members above,
    // while the seam it is injected into demands all 70+. Narrowing the seam would mean
    // diverging vendored src from upstream for test convenience.
  } as unknown as Vitest
}

export function createSuite(
  overrides?: Partial<RunnerTestSuite>,
): RunnerTestSuite {
  return {
    id: '1',
    meta: { hitCount: undefined, mutantCoverage: undefined },
    mode: 'run',
    fullName: 'test/suite-name.test.ts > suite-test',
    name: 'suite',
    tasks: [],
    type: 'suite',
    file: createVitestFile(),
    ...overrides,
  }
}

export function createVitestFile(
  overrides?: Partial<Omit<RunnerTestFile, 'file'>>,
): RunnerTestFile {
  const file = {
    projectName: '',
    name: 'file.js',
    filepath: 'file.spec.js',
    type: 'suite',
    id: '1',
    mode: 'run',
    tasks: [],
    meta: { hitCount: undefined, mutantCoverage: undefined },
    ...overrides,
  } as RunnerTestFile
  file.file = file
  return file
}

export function createVitestTest(
  overrides?: Partial<RunnerTestCase>,
): RunnerTestCase {
  return {
    type: 'test',
    suite: createSuite(),
    id: '1',
    fullTestName: 'suite-test > test1',
    fullName: 'test/suite-name.test.ts > suite-test > test1',
    name: 'test1',
    meta: { hitCount: undefined, mutantCoverage: undefined },
    mode: 'run',
    timeout: 0,
    context: {} as RunnerTestCase['context'],
    file: createVitestFile(),
    annotations: [],
    artifacts: [],
    ...overrides,
  }
}

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
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    info: vi.fn(),
    isDebugEnabled: () => false,
    isErrorEnabled: () => false,
    isFatalEnabled: () => false,
    isInfoEnabled: () => false,
    isTraceEnabled: () => false,
    isWarnEnabled: () => false,
    trace: vi.fn(),
    warn: vi.fn(),
  }
}

export function createStrykerOptions(
  overrides?: Partial<VitestRunnerOptionsWithStrykerOptions>,
): VitestRunnerOptionsWithStrykerOptions {
  const options: Partial<StrykerOptions> = {}
  fillStrykerDefaults(options)
  return {
    ...options,
    vitest: createVitestRunnerOptions(),
    ...overrides,
  }
}

export const createTestInjector = (
  options: VitestRunnerOptionsWithStrykerOptions,
  logger: Logger = createLogger(),
) =>
  createInjector()
    .provideValue(commonTokens.options, options)
    .provideValue(commonTokens.logger, logger)

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
