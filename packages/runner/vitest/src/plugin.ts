/**
 * The Vite plugin that hands the fork's runtime what it reads under `inject`, and serves the runtime half of the
 * `effect/TestClock` compat path. It sets no test option: removing it from a config changes no file, project,
 * timeout, condition, reporter or setup file, only what the fork's runtime finds provided.
 *
 * Provided, per test project, unless the project's own `test.provide` already sets the key:
 * - `@systemfsoftware/vitest:package`: the npm name in the project root's `package.json`;
 * - `@systemfsoftware/vitest:workspace-root`: the nearest ancestor holding `pnpm-workspace.yaml`, else the root;
 * - `@systemfsoftware/vitest:property-check`: the run's property budget. A Stryker worker draws 30 runs and a CI
 *   run 1000, and neither writes the seed store; any other run draws 100. `AGENT` outranks `CI`, so an agent
 *   shell that also sets `CI` gets the local tier.
 *
 * @since 4.1.0
 */
import { layer as nodeFileSystemLayer } from '@effect/platform-node/NodeFileSystem'
import { layer as nodePathLayer } from '@effect/platform-node/NodePath'
import * as Arr from 'effect/Array'
import * as Config from 'effect/Config'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import * as Schema from 'effect/Schema'
import type { ProvidedContext } from 'vitest'
import type { Plugin } from 'vitest/config'
import type { TestProject } from 'vitest/node'
import { checkDefaultsKey, type ProvidedCheckDefaults } from './internal/property/defaults.js'
import { packageKey, workspaceRootKey } from './internal/provided.js'
import { PackageManifestFromJson, type PackageName } from './internal/provided.schema.js'

const WORKSPACE_MARKER = 'pnpm-workspace.yaml'

const COMPAT_TEST_CLOCK = 'effect/TestClock'

const FORK_TEST_CLOCK = '@systemfsoftware/vitest/TestClock'

const MUTATION_BUDGET: ProvidedCheckDefaults = { runs: 30, record: false }

const CI_BUDGET: ProvidedCheckDefaults = { runs: 1000, record: false }

const LOCAL_BUDGET: ProvidedCheckDefaults = { runs: 100 }

interface PackageFacts {
  readonly name: PackageName
  readonly workspaceRoot: string
  readonly budget: ProvidedCheckDefaults
}

type ForkKey = typeof packageKey | typeof workspaceRootKey | typeof checkDefaultsKey

const isSet = (name: string): Effect.Effect<boolean, Config.ConfigError> =>
  Effect.map(Config.option(Config.String(name)), Option.isSome)

const isNonEmpty = (name: string): Effect.Effect<boolean, Config.ConfigError> =>
  Effect.map(Config.option(Config.String(name)), Option.exists((value) => value.length > 0))

const budgetOf = (tiers: ReadonlyArray<readonly [boolean, ProvidedCheckDefaults]>): ProvidedCheckDefaults =>
  Option.getOrElse(Option.map(Arr.findFirst(tiers, ([applies]) => applies), ([, budget]) => budget), () => LOCAL_BUDGET)

const runBudget: Effect.Effect<ProvidedCheckDefaults, Config.ConfigError> = Effect.map(
  Effect.all({ agent: isSet('AGENT'), ci: isNonEmpty('CI'), mutationWorker: isSet('STRYKER_MUTATOR_WORKER') }),
  ({ agent, ci, mutationWorker }) =>
    budgetOf([[mutationWorker, MUTATION_BUDGET], [[ci, !agent].every(Boolean), CI_BUDGET]]),
)

const ancestorsOf = (path: Path.Path, start: string): ReadonlyArray<string> =>
  Arr.unfold(
    Option.some(start),
    (current) =>
      Option.map(current, (dir) =>
        [dir, Option.filter(Option.some(path.dirname(dir)), (parent) => parent !== dir)] as const),
  )

const workspaceRootFrom = (start: string): Effect.Effect<string, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const found = yield* Effect.findFirst(
      ancestorsOf(path, start),
      (dir) => Effect.orElseSucceed(fs.exists(path.join(dir, WORKSPACE_MARKER)), () => false),
    )
    return Option.getOrElse(found, () => start)
  })

const factsAt = (root: string) =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const manifest = yield* Schema.decodeEffect(PackageManifestFromJson)(
      yield* fs.readFileString(path.join(root, 'package.json')),
    )
    return {
      name: manifest.name,
      workspaceRoot: yield* workspaceRootFrom(root),
      budget: yield* runBudget,
    } satisfies PackageFacts
  }).pipe(
    Effect.provide(Layer.mergeAll(nodeFileSystemLayer, nodePathLayer)),
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv({ preserveEmptyStrings: true })),
  )

const provideUnset = <K extends ForkKey>(project: TestProject, key: K, value: ProvidedContext[K]): void => {
  if (!(key in project.getProvidedContext())) project.provide(key, value)
}

const provideFacts = (project: TestProject, facts: PackageFacts): void => {
  provideUnset(project, packageKey, facts.name)
  provideUnset(project, workspaceRootKey, facts.workspaceRoot)
  provideUnset(project, checkDefaultsKey, facts.budget)
}

/**
 * The fork's Vite plugin: list it in a package's `plugins` to give the fork's runtime its provided context and
 * the `effect/TestClock` compat path. A project root whose `package.json` has no `name` fails config resolution.
 *
 * @example
 * ```ts
 * import { vitestFork } from '@systemfsoftware/vitest/plugin'
 * import { defineConfig } from 'vitest/config'
 *
 * export default defineConfig({ plugins: [vitestFork()] })
 * ```
 *
 * @since 4.1.0
 */
export const vitestFork = (): Plugin => {
  const factsByRoot = new Map<string, PackageFacts>()
  return {
    name: '@systemfsoftware/vitest',
    enforce: 'pre',
    configResolved: async (config) => {
      factsByRoot.set(config.root, await Effect.runPromise(factsAt(config.root)))
    },
    configureVitest: ({ project }) => {
      Option.map(
        Option.fromUndefinedOr(factsByRoot.get(project.vite.config.root)),
        (facts) => provideFacts(project, facts),
      )
    },
    resolveId(id, importer) {
      return id === COMPAT_TEST_CLOCK ? this.resolve(FORK_TEST_CLOCK, importer, { skipSelf: true }) : null
    },
  }
}
