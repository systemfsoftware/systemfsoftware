/**
 * The Vite plugin a Node `vitest.config.ts` lists in `plugins`, published as `@systemfsoftware/vitest/vite`. Once per
 * project it publishes to the run's workers, under `test.provide`, the facts only the main process can read: the
 * checked-out commit (from `GITHUB_SHA`, `CI_COMMIT_SHA` or `COMMIT_SHA`, else one `git rev-parse HEAD`), the config
 * file the project loaded, its package directory, and the workspace root when the config provides none. It decides
 * nothing: the runner's budget takes its tier, runs and seed from `PropertyConfig` and these facts, and a run without
 * the plugin falls back to what its workers' environment names. `@systemfsoftware/vitest-config` lists it already.
 *
 * @since 4.2.0
 */
import { NodeServices } from '@effect/platform-node'
import { Effect, Layer, Option } from 'effect'
import { ChildProcessSpawner } from 'effect/process'
import type { Plugin } from 'vitest/config'
import type { TestProject } from 'vitest/node'
import { PropertyConfig } from './config.js'
import { commitKey, configFileKey, packageRootKey, workspaceRootKey } from './internal/provided-keys.js'
import { GitHead, gitRevParseHead, type PublishedFacts, publishedFactsOf } from './internal/run-facts.js'

const gitHeadLayer = Layer.effect(
  GitHead,
  Effect.gen(function*() {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    return {
      commitIn: (directory: string) =>
        gitRevParseHead(directory).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner)),
    }
  }),
)

const liveLayer = Layer.mergeAll(PropertyConfig.layer, gitHeadLayer).pipe(Layer.provideMerge(NodeServices.layer))

const provideFact = (
  project: TestProject,
  key: typeof commitKey | typeof configFileKey | typeof packageRootKey | typeof workspaceRootKey,
  value: Option.Option<string>,
): void => {
  if (Option.isSome(value)) project.provide(key, value.value)
}

const publish = (project: TestProject, facts: PublishedFacts): void => {
  provideFact(project, commitKey, facts.commit)
  provideFact(project, configFileKey, facts.configFile)
  provideFact(project, packageRootKey, facts.packageRoot)
  const provided = project.config.provide[workspaceRootKey]
  provideFact(project, workspaceRootKey, provided === undefined ? facts.workspaceRoot : Option.none())
}

/** @since 4.2.0 */
export const propertyRunFacts = (): Plugin => {
  const factsByConfig = new WeakMap<object, PublishedFacts>()
  return {
    name: '@systemfsoftware/vitest:property-run-facts',
    configResolved: async (config) => {
      const facts = await Effect.runPromise(
        publishedFactsOf({ root: config.root, configFile: config.configFile }).pipe(Effect.provide(liveLayer)),
      )
      factsByConfig.set(config, facts)
    },
    configureVitest: ({ project }) => {
      const facts = factsByConfig.get(project.vite.config)
      if (facts !== undefined) publish(project, facts)
    },
  }
}
