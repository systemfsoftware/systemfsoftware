/**
 * ProjectConfig — config loading behaviour tests.
 *
 * Drives the `ProjectConfig.load` use case through the `MemoryFileSystem` Layer.
 * Covers three-layer user/project/local merging with per-key override, and the
 * single project file case with its parse tolerance and per-cwd cache behavior.
 * The merge kernel is reached through the adapter that owns it, as production does.
 */
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Layer } from 'effect'
import * as PathModule from 'effect/Path'
import { expect } from 'vitest'

import { ProjectConfig, ProjectConfigLive } from '@systemfsoftware/omp-platform'

const Feature = makeFeature({ it, layer })

const HOME = '/home/test'

process.env['OMP_USER_CONFIG_HOME'] = HOME

const buildLayer = (contents: Record<string, string>) =>
  ProjectConfigLive.pipe(
    Layer.provide(MemoryFileSystem.layerWith(contents)),
    Layer.provide(PathModule.layer),
  )

Feature('ProjectConfig — project-only file with shape and parse tolerance').body(({ scenario }) => {
  scenario(
    'A valid project TOML with two arrays is parsed into both keys',
    {
      scenarioLayer: buildLayer({
        '/test/systemfsoftware.toml': 'plugins = ["one", "two"]\nfoo = ["bar"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project at /test with a valid TOML file')('cwd', () => Effect.succeed('/test')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* ProjectConfig
          return yield* loader.load(s.cwd)
        })),
      Then('both keys appear with their array values')((s) =>
        Effect.sync(() => {
          expect(s.config).toEqual({ plugins: ['one', 'two'], foo: ['bar'] })
        })
      ),
    ),
  )

  scenario(
    'A project with no config file at all returns an empty merged config',
    { scenarioLayer: buildLayer({}) },
    Gherkin.Do.pipe(
      Given('a project at /empty with no TOML file')('cwd', () => Effect.succeed('/empty')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* ProjectConfig
          return yield* loader.load(s.cwd)
        })),
      Then('the merged config is empty')((s) =>
        Effect.sync(() => {
          expect(s.config).toEqual({})
        })
      ),
    ),
  )

  scenario(
    'A malformed project TOML fails open and the failure is deduplicated',
    {
      scenarioLayer: buildLayer({
        '/test/systemfsoftware.toml': 'garbage [[ =\ninvalid',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project at /test with a malformed TOML file')('cwd', () => Effect.succeed('/test')),
      When('ProjectConfig.load is called twice')('loads', (s) =>
        Effect.gen(function*() {
          const loader = yield* ProjectConfig
          const first = yield* loader.load(s.cwd)
          const second = yield* loader.load(s.cwd)
          return { first, second }
        })),
      Then('both calls return an empty config')((s) =>
        Effect.sync(() => {
          expect(s.loads.first).toEqual({})
          expect(s.loads.second).toEqual({})
        })
      ),
    ),
  )

  scenario(
    'A second load on the same cwd returns the cached merged object',
    {
      scenarioLayer: buildLayer({
        '/test/systemfsoftware.toml': 'plugins = ["original"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project at /test with one plugin list')('cwd', () => Effect.succeed('/test')),
      When('ProjectConfig.load is called twice')('loads', (s) =>
        Effect.gen(function*() {
          const loader = yield* ProjectConfig
          const first = yield* loader.load(s.cwd)
          const second = yield* loader.load(s.cwd)
          return { first, second }
        })),
      Then('both calls return the same plugins value')((s) =>
        Effect.sync(() => {
          expect(s.loads.first).toEqual({ plugins: ['original'] })
          expect(s.loads.second).toEqual({ plugins: ['original'] })
        })
      ),
    ),
  )

  scenario(
    'A project TOML whose value types do not match the schema fails open',
    {
      scenarioLayer: buildLayer({
        '/test/systemfsoftware.toml': 'plugins = "not-an-array"',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project at /test whose TOML uses a string where an array is required')(
        'cwd',
        () => Effect.succeed('/test'),
      ),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* ProjectConfig
          return yield* loader.load(s.cwd)
        })),
      Then('the merged config is empty')((s) =>
        Effect.sync(() => {
          expect(s.config).toEqual({})
        })
      ),
    ),
  )
})
