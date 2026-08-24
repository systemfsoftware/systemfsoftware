import { fileURLToPath } from 'node:url'

import { Context, Effect } from 'effect'
import * as Layer from 'effect/Layer'
import type { Scope } from 'effect/Scope'

import type { StrykerOptions } from '@systemfsoftware/stryker-js-plugin-api/core'
import { TestRunner } from '@systemfsoftware/stryker-js-plugin-api/test-runner'
import { makeVitestRunnerLayer } from '../../src/vitest-test-runner.js'
import {
  createStrykerOptions,
  createVitestRunnerOptions,
  type VitestRunnerOptions,
  type VitestRunnerOptionsWithStrykerOptions,
} from './factories.js'

import { TempTestDirectorySandbox } from './temp-test-directory-sandbox.js'

type MutableStrykerOptions = { -readonly [K in keyof StrykerOptions]: StrykerOptions[K] }

export type MutableRunnerOptions = MutableStrykerOptions & { vitest: VitestRunnerOptions }

export interface RunnerContext {
  readonly sut: {
    readonly init: () => Promise<void>
    readonly dryRun: (
      ...args: Parameters<TestRunner['Service']['dryRun']>
    ) => Promise<
      Awaited<
        ReturnType<TestRunner['Service']['dryRun']> extends Effect.Effect<infer A, unknown, unknown> ? Promise<A>
          : never
      >
    >
    readonly mutantRun: (
      ...args: Parameters<TestRunner['Service']['mutantRun']>
    ) => Promise<
      Awaited<
        ReturnType<TestRunner['Service']['mutantRun']> extends Effect.Effect<infer A, unknown, unknown> ? Promise<A>
          : never
      >
    >
    readonly dispose: () => Promise<void>
  }
  readonly options: VitestRunnerOptionsWithStrykerOptions
  readonly sandbox: TempTestDirectorySandbox
}

export const runnerContext = (
  project: string,
  configure?: (options: MutableRunnerOptions) => void,
): Effect.Effect<RunnerContext, never, Scope> =>
  Effect.acquireRelease(
    Effect.gen(function*() {
      const sandbox = new TempTestDirectorySandbox(project)
      yield* Effect.promise(() => sandbox.init())
      const options = createStrykerOptions()
      options.vitest = createVitestRunnerOptions({ related: false })
      if (configure !== undefined) {
        configure(options)
      }
      const layer = makeVitestRunnerLayer({
        options,
        sandboxDirectory: sandbox.tmpDir,
        globalNamespace: '__stryker2__',
        // This suite imports the runner from `src/`, where the emitted
        // `stryker-setup.mjs` sibling does not exist — it is built into
        // `dist/`. Naming it here keeps the product's own default correct for
        // an installed package instead of teaching it about this layout.
        setupFilePath: fileURLToPath(new URL('../../dist/stryker-setup.mjs', import.meta.url)),
      })
      const context = yield* Layer.build(layer)
      const service = Context.get(context, TestRunner)
      const sut = {
        init: () => Effect.runPromise(service.init),
        dryRun: (opts: Parameters<TestRunner['Service']['dryRun']>[0]) => Effect.runPromise(service.dryRun(opts)),
        mutantRun: (opts: Parameters<TestRunner['Service']['mutantRun']>[0]) =>
          Effect.runPromise(service.mutantRun(opts)),
        dispose: () => Effect.runPromise(service.dispose),
      }
      return { sut: sut, options, sandbox }
    }),
    ({ sut, sandbox }) =>
      Effect.gen(function*() {
        yield* Effect.promise(() => sut.dispose())
        yield* Effect.promise(() => sandbox.dispose())
      }),
  )

export const initRunner = (context: RunnerContext): Effect.Effect<RunnerContext> =>
  Effect.promise(async () => {
    await context.sut.init()
    return context
  })
