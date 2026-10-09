import { it, vi } from '@systemfsoftware/vitest'
import { vitestFork } from '@systemfsoftware/vitest/plugin'
import { Effect } from 'effect'
import type { InlineConfig } from 'vitest/node'
import { createVitest } from 'vitest/node'
import {
  forkTestClock,
  type PluginWorkspace,
  pluginWorkspace,
  removeWorkspace,
} from './__fixtures__/plugin-workspace.js'

const inWorkspace = <A, E>(
  input: { readonly manifest: object; readonly marked: boolean },
  use: (workspace: PluginWorkspace) => Effect.Effect<A, E>,
): Effect.Effect<A, E> =>
  Effect.acquireUseRelease(
    Effect.sync(() => pluginWorkspace(input)),
    use,
    (workspace) => Effect.sync(() => removeWorkspace(workspace)),
  )

const resolvedProject = (packageDir: string, options: InlineConfig = {}) =>
  Effect.acquireRelease(
    Effect.promise(() =>
      createVitest({ config: false, root: packageDir, watch: false, ...options }, {
        plugins: [vitestFork()],
        resolve: { conditions: ['@systemfsoftware/source'] },
        ssr: { resolve: { conditions: ['@systemfsoftware/source'] } },
      })
    ),
    (vitest) => Effect.promise(() => vitest.close()),
  ).pipe(Effect.map((vitest) => vitest.projects[0]))

const providedIn = (packageDir: string, options?: InlineConfig) =>
  Effect.scoped(Effect.map(resolvedProject(packageDir, options), (project) => project?.getProvidedContext()))

const appManifest = { name: '@fixture/app' }

it('Should_ProvideThePackageNameAndWorkspaceRoot_When_ProjectResolves', function*({ expect }) {
  const provided = yield* inWorkspace(
    { manifest: appManifest, marked: true },
    (workspace) => Effect.map(providedIn(workspace.packageDir), (context) => ({ context, root: workspace.root })),
  )
  yield* expect(provided.context).toMatchObject({
    '@systemfsoftware/vitest:package': '@fixture/app',
    '@systemfsoftware/vitest:workspace-root': provided.root,
  })
})

it('Should_ProvideThePackageDirAsRoot_When_NoAncestorHoldsWorkspaceFile', function*({ expect }) {
  const provided = yield* inWorkspace(
    { manifest: appManifest, marked: false },
    (workspace) =>
      Effect.map(providedIn(workspace.packageDir), (context) => ({ context, packageDir: workspace.packageDir })),
  )
  yield* expect(provided.context?.['@systemfsoftware/vitest:workspace-root']).toEqual(provided.packageDir)
})

type TierEnv = Readonly<Record<'AGENT' | 'CI' | 'STRYKER_MUTATOR_WORKER', string | undefined>>

const stubTier = (env: TierEnv): void => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
}

const budgetUnder = (env: TierEnv) =>
  inWorkspace({ manifest: appManifest, marked: true }, (workspace) =>
    Effect.acquireUseRelease(
      Effect.sync(() => stubTier(env)),
      () => providedIn(workspace.packageDir),
      () => Effect.sync(() => vi.unstubAllEnvs()),
    )).pipe(Effect.map((context) => context?.['@systemfsoftware/vitest:property-check']))

it('Should_DrawTheThoroughTierWithoutRecording_When_CiRunsWithoutAgent', function*({ expect }) {
  yield* expect(yield* budgetUnder({ AGENT: undefined, CI: 'true', STRYKER_MUTATOR_WORKER: undefined })).toEqual({
    runs: 1000,
    record: false,
  })
})

it('Should_DrawTheLocalTier_When_AgentShellAlsoSetsCi', function*({ expect }) {
  yield* expect(yield* budgetUnder({ AGENT: '1', CI: '1', STRYKER_MUTATOR_WORKER: undefined })).toEqual({ runs: 100 })
})

it('Should_DrawTheLocalTier_When_AgentIsSetButEmpty', function*({ expect }) {
  yield* expect(yield* budgetUnder({ AGENT: '', CI: 'true', STRYKER_MUTATOR_WORKER: undefined })).toEqual({ runs: 100 })
})

it('Should_DrawTheMutationTierWithoutRecording_When_StrykerWorkerRuns', function*({ expect }) {
  yield* expect(yield* budgetUnder({ AGENT: undefined, CI: 'true', STRYKER_MUTATOR_WORKER: '3' })).toEqual({
    runs: 30,
    record: false,
  })
})

it('Should_KeepThePackagesOwnBudget_When_ItsConfigProvidesOne', function*({ expect }) {
  const provided = yield* inWorkspace(
    { manifest: appManifest, marked: true },
    (workspace) =>
      providedIn(workspace.packageDir, { provide: { '@systemfsoftware/vitest:property-check': { runs: 7 } } }),
  )
  yield* expect(provided?.['@systemfsoftware/vitest:property-check']).toEqual({ runs: 7 })
})

it('Should_RefuseTheConfig_When_ThePackageJsonHasNoName', function*({ expect }) {
  const exit = yield* inWorkspace(
    { manifest: {}, marked: true },
    (workspace) => Effect.exit(providedIn(workspace.packageDir)),
  )
  yield* expect(exit._tag).toEqual('Failure')
})

it('Should_ResolveTheCompatTestClockToTheFork_When_TestImportsIt', function*({ expect }) {
  const resolved = yield* inWorkspace({ manifest: appManifest, marked: true }, (workspace) =>
    Effect.scoped(
      Effect.flatMap(resolvedProject(workspace.packageDir), (project) =>
        Effect.promise(async () =>
          (await project?.vite.environments['ssr']?.pluginContainer.resolveId('effect/TestClock', workspace.testFile))
            ?.id
        )),
    ))
  yield* expect(resolved).toEqual(forkTestClock)
})
