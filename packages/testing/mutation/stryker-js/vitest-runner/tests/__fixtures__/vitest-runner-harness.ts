import fs from 'fs'
import { fileURLToPath } from 'node:url'
import path from 'path'

import { NodeFileSystem, NodePath } from '@effect/platform-node'
import { Context, Effect } from 'effect'
import * as Layer from 'effect/Layer'
import type { Scope } from 'effect/Scope'

import type { StrykerOptions } from '@systemfsoftware/stryker-js/Schema'
import { TestRunner } from '@systemfsoftware/stryker-js/TestRunner'
import { makeVitestRunnerLayer } from '../../src/Runner.js'
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
      const ctx = yield* Effect.context<never>()
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
      const context = yield* Layer.build(layer).pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      )
      const service = Context.get(context, TestRunner)
      const sut = {
        init: () => Effect.runPromiseWith(ctx)(service.init),
        dryRun: (opts: Parameters<TestRunner['Service']['dryRun']>[0]) =>
          Effect.runPromiseWith(ctx)(service.dryRun(opts)),
        mutantRun: (opts: Parameters<TestRunner['Service']['mutantRun']>[0]) =>
          Effect.runPromiseWith(ctx)(service.mutantRun(opts)),
        dispose: () => Effect.runPromiseWith(ctx)(service.dispose),
      }
      return { sut: sut, options, sandbox }
    }),
    ({ sut, sandbox }) =>
      Effect.gen(function*() {
        yield* Effect.promise(() => sut.dispose())
        yield* Effect.promise(() => sandbox.dispose())
      }),
  )

export interface TwoRunnersContext {
  readonly runner1: RunnerContext
  readonly runner2: RunnerContext
  readonly setupFile1: string
  readonly setupFile2: string
}

export const twoRunnersContext = (
  project: string,
): Effect.Effect<TwoRunnersContext, unknown, Scope> =>
  Effect.acquireRelease(
    Effect.gen(function*() {
      const ctx = yield* Effect.context<never>()
      const sandbox1 = new TempTestDirectorySandbox(project)
      yield* Effect.promise(() => sandbox1.init())
      const sandbox2 = new TempTestDirectorySandbox(project)
      yield* Effect.promise(() => sandbox2.init())
      const options1 = createStrykerOptions()
      options1.vitest = createVitestRunnerOptions({ related: false })
      const options2 = createStrykerOptions()
      options2.vitest = createVitestRunnerOptions({ related: false })
      const setupFilePath = fileURLToPath(new URL('../../dist/stryker-setup.mjs', import.meta.url))
      const layer1 = makeVitestRunnerLayer({
        options: options1,
        sandboxDirectory: sandbox1.tmpDir,
        globalNamespace: '__stryker2__',
        setupFilePath,
      })
      const layer2 = makeVitestRunnerLayer({
        options: options2,
        sandboxDirectory: sandbox2.tmpDir,
        globalNamespace: '__stryker2__',
        setupFilePath,
      })
      const context1 = yield* Layer.build(layer1).pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      )
      const service1 = Context.get(context1, TestRunner)
      const context2 = yield* Layer.build(layer2).pipe(
        Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
      )
      const service2 = Context.get(context2, TestRunner)
      yield* service1.init
      yield* service2.init
      const setupFile1 = path.resolve(sandbox1.tmpDir, `stryker-setup-${process.pid}.js`)
      const setupFile2 = path.resolve(sandbox2.tmpDir, `stryker-setup-${process.pid}.js`)
      yield* Effect.promise(() => fs.promises.access(setupFile1))
      yield* Effect.promise(() => fs.promises.access(setupFile2))
      const runner1: RunnerContext = {
        sut: {
          init: () => Effect.runPromiseWith(ctx)(service1.init),
          dryRun: (opts) => Effect.runPromiseWith(ctx)(service1.dryRun(opts)),
          mutantRun: (opts) => Effect.runPromiseWith(ctx)(service1.mutantRun(opts)),
          dispose: () => Effect.runPromiseWith(ctx)(service1.dispose),
        },
        options: options1,
        sandbox: sandbox1,
      }
      const runner2: RunnerContext = {
        sut: {
          init: () => Effect.runPromiseWith(ctx)(service2.init),
          dryRun: (opts) => Effect.runPromiseWith(ctx)(service2.dryRun(opts)),
          mutantRun: (opts) => Effect.runPromiseWith(ctx)(service2.mutantRun(opts)),
          dispose: () => Effect.runPromiseWith(ctx)(service2.dispose),
        },
        options: options2,
        sandbox: sandbox2,
      }
      return { runner1, runner2, setupFile1, setupFile2 }
    }),
    ({ runner1, runner2 }) =>
      Effect.gen(function*() {
        yield* Effect.ignore(Effect.promise(() => runner1.sut.dispose()))
        yield* Effect.ignore(Effect.promise(() => runner2.sut.dispose()))
        yield* Effect.ignore(Effect.promise(() => runner1.sandbox.dispose()))
        yield* Effect.ignore(Effect.promise(() => runner2.sandbox.dispose()))
      }),
  )

export const initRunner = (context: RunnerContext): Effect.Effect<RunnerContext> =>
  Effect.promise(async () => {
    await context.sut.init()
    return context
  })
