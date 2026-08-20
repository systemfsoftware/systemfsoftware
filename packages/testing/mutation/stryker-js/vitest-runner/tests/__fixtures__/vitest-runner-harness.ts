import { Effect } from 'effect'
import type { Scope } from 'effect/Scope'

import { commonTokens } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { createVitestTestRunnerFactory, VitestTestRunner } from '../../dist/index.mjs'
import type {
  VitestRunnerOptions,
  VitestRunnerOptionsWithStrykerOptions,
} from '../../src/vitest-runner-options-with-stryker-options.js'
import { createStrykerOptions, createTestInjector, createVitestRunnerOptions } from './factories.js'
import { TempTestDirectorySandbox } from './temp-test-directory-sandbox.js'

/**
 * The options document with its read-only core view made writable: the specs
 * reconfigure the runner before init (e.g. `disableBail`, `vitest.related`).
 */
type MutableStrykerOptions = { -readonly [K in keyof StrykerOptions]: StrykerOptions[K] }

export type MutableRunnerOptions = MutableStrykerOptions & { vitest: VitestRunnerOptions }

export interface RunnerContext {
  readonly sut: VitestTestRunner
  readonly options: VitestRunnerOptionsWithStrykerOptions
  readonly sandbox: TempTestDirectorySandbox
}

/**
 * A Stryker runner bound to a fresh copy of a `testResources` project. The
 * sandbox is copied (a fixture cannot be loaded twice in one process) and the
 * runner's project root is anchored to the copy, mirroring the sandbox
 * injection a real mutation run performs.
 */
export const runnerContext = (
  project: string,
  configure?: (options: MutableRunnerOptions) => void,
): Effect.Effect<RunnerContext, never, Scope> =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const sandbox = new TempTestDirectorySandbox(project)
      await sandbox.init()
      const options = createStrykerOptions()
      options.vitest = createVitestRunnerOptions({ related: false })
      // The runner snapshots options at construction (`this.options` is a
      // decode of the input), so scenario configuration must land before the
      // runner exists.
      if (configure !== undefined) {
        configure(options)
      }
      const sut = createTestInjector(options)
        .provideValue(commonTokens.sandboxDirectory, sandbox.tmpDir)
        .injectFunction(createVitestTestRunnerFactory('__stryker2__'))
      return { sut, options, sandbox }
    }),
    ({ sut, sandbox }) =>
      Effect.promise(async () => {
        await sut.dispose()
        await sandbox.dispose()
      }),
  )

export const initRunner = (
  context: RunnerContext,
): Effect.Effect<RunnerContext> =>
  Effect.promise(async () => {
    await context.sut.init()
    return context
  })
