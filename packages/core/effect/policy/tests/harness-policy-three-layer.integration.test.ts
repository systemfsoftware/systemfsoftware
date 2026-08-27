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

import { HarnessPolicy, HarnessPolicyLive } from '@systemfsoftware/effect-harness-policy'

const Feature = makeFeature({ it, layer })

const HOME = '/home/test'

process.env['HARNESS_POLICY_HOME'] = HOME

const buildLayer = (contents: Record<string, string>) =>
  HarnessPolicyLive.pipe(
    Layer.provide(MemoryFileSystem.layerWith(contents)),
    Layer.provide(PathModule.layer),
  )

Feature('ProjectConfig — three-layer config with per-key override').body(({ scenario }) => {
  scenario(
    'Should merge user and project when keys are disjoint',
    {
      scenarioLayer: buildLayer({
        [`${HOME}/.config/systemfsoftware/systemfsoftware.toml`]: 'no_delegate_skills = ["user-skill"]',
        '/proj/systemfsoftware.toml': 'dispatch_doctrine_skills = ["project-skill"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project at /proj')('cwd', () => Effect.succeed('/proj')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* HarnessPolicy
          return yield* loader.load(s.cwd)
        })),
      Then('both layer keys appear in the merged config')((s) =>
        Effect.sync(() => {
          expect(s.config).toEqual({
            no_delegate_skills: ['user-skill'],
            dispatch_doctrine_skills: ['project-skill'],
          })
        })
      ),
    ),
  )

  scenario(
    'Should let project win when user and project set the same key',
    {
      scenarioLayer: buildLayer({
        [`${HOME}/.config/systemfsoftware/systemfsoftware.toml`]: 'no_delegate_skills = ["user"]',
        '/proj/systemfsoftware.toml': 'no_delegate_skills = ["project"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('user and project layers setting the same key')('cwd', () => Effect.succeed('/proj')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* HarnessPolicy
          return yield* loader.load(s.cwd)
        })),
      Then('the project value wins')((s) =>
        Effect.sync(() => {
          expect(s.config['no_delegate_skills']).toEqual(['project'])
        })
      ),
    ),
  )

  scenario(
    'Should let local win when project and local set the same key',
    {
      scenarioLayer: buildLayer({
        '/proj/systemfsoftware.toml': 'no_delegate_skills = ["project"]',
        '/proj/systemfsoftware.local.toml': 'no_delegate_skills = ["local"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('project and local layers setting the same key')('cwd', () => Effect.succeed('/proj')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* HarnessPolicy
          return yield* loader.load(s.cwd)
        })),
      Then('the local value wins')((s) =>
        Effect.sync(() => {
          expect(s.config['no_delegate_skills']).toEqual(['local'])
        })
      ),
    ),
  )

  scenario(
    'Should let local win when user and local set the same key',
    {
      scenarioLayer: buildLayer({
        [`${HOME}/.config/systemfsoftware/systemfsoftware.toml`]: 'no_delegate_skills = ["user"]',
        '/proj/systemfsoftware.local.toml': 'no_delegate_skills = ["local"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('user and local layers setting the same key')('cwd', () => Effect.succeed('/proj')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* HarnessPolicy
          return yield* loader.load(s.cwd)
        })),
      Then('the local value wins')((s) =>
        Effect.sync(() => {
          expect(s.config['no_delegate_skills']).toEqual(['local'])
        })
      ),
    ),
  )

  scenario(
    'Should return empty when all layers are missing',
    { scenarioLayer: buildLayer({}) },
    Gherkin.Do.pipe(
      Given('no user, project, or local file')('cwd', () => Effect.succeed('/empty')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* HarnessPolicy
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
    'Should return user only when only the user layer is present',
    {
      scenarioLayer: buildLayer({
        [`${HOME}/.config/systemfsoftware/systemfsoftware.toml`]: 'no_delegate_skills = ["only-user"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('only the user layer is present')('cwd', () => Effect.succeed('/proj')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* HarnessPolicy
          return yield* loader.load(s.cwd)
        })),
      Then('the user value is returned')((s) =>
        Effect.sync(() => {
          expect(s.config).toEqual({ no_delegate_skills: ['only-user'] })
        })
      ),
    ),
  )

  scenario(
    'Should replace array whole when a later layer overrides the array',
    {
      scenarioLayer: buildLayer({
        [`${HOME}/.config/systemfsoftware/systemfsoftware.toml`]: 'plugins = ["a", "b", "c"]',
        '/proj/systemfsoftware.toml': 'plugins = ["only-this-one"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('user sets a three-element array and project overrides')('cwd', () => Effect.succeed('/proj')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* HarnessPolicy
          return yield* loader.load(s.cwd)
        })),
      Then('the project array replaces the user array whole')((s) =>
        Effect.sync(() => {
          expect(s.config['plugins']).toEqual(['only-this-one'])
        })
      ),
    ),
  )

  scenario(
    'Should keep user keys when the project TOML is malformed',
    {
      scenarioLayer: buildLayer({
        [`${HOME}/.config/systemfsoftware/systemfsoftware.toml`]: 'no_delegate_skills = ["user"]',
        '/proj/systemfsoftware.toml': 'garbage [[ =\ninvalid',
      }),
    },
    Gherkin.Do.pipe(
      Given('user layer is valid and project is malformed')('cwd', () => Effect.succeed('/proj')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* HarnessPolicy
          return yield* loader.load(s.cwd)
        })),
      Then('user keys still apply')((s) =>
        Effect.sync(() => {
          expect(s.config['no_delegate_skills']).toEqual(['user'])
        })
      ),
    ),
  )

  scenario(
    'Should keep project keys when the user TOML is malformed',
    {
      scenarioLayer: buildLayer({
        [`${HOME}/.config/systemfsoftware/systemfsoftware.toml`]: 'garbage [[ =\ninvalid',
        '/proj/systemfsoftware.toml': 'no_delegate_skills = ["project"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('user layer is malformed and project is valid')('cwd', () => Effect.succeed('/proj')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* HarnessPolicy
          return yield* loader.load(s.cwd)
        })),
      Then('project keys still apply')((s) =>
        Effect.sync(() => {
          expect(s.config['no_delegate_skills']).toEqual(['project'])
        })
      ),
    ),
  )

  scenario(
    'Should let project win when the local TOML is malformed',
    {
      scenarioLayer: buildLayer({
        '/proj/systemfsoftware.toml': 'no_delegate_skills = ["project"]',
        '/proj/systemfsoftware.local.toml': 'garbage [[ =\ninvalid',
      }),
    },
    Gherkin.Do.pipe(
      Given('project is valid and local is malformed')('cwd', () => Effect.succeed('/proj')),
      When('ProjectConfig.load is called')('config', (s) =>
        Effect.gen(function*() {
          const loader = yield* HarnessPolicy
          return yield* loader.load(s.cwd)
        })),
      Then('project still wins')((s) =>
        Effect.sync(() => {
          expect(s.config['no_delegate_skills']).toEqual(['project'])
        })
      ),
    ),
  )

  scenario(
    'Should return the same merged object on repeat loads (cache)',
    {
      scenarioLayer: buildLayer({
        [`${HOME}/.config/systemfsoftware/systemfsoftware.toml`]: 'no_delegate_skills = ["user"]',
        '/proj/systemfsoftware.toml':
          'no_delegate_skills = ["project"]\ndispatch_doctrine_skills = ["project-doctrine"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project with both layers')('cwd', () => Effect.succeed('/proj')),
      When('ProjectConfig.load is called twice')('result', (s) =>
        Effect.gen(function*() {
          const loader = yield* HarnessPolicy
          const first = yield* loader.load(s.cwd)
          const second = yield* loader.load(s.cwd)
          return { first, second }
        })),
      Then('the second call returns the cached merged object')((s) =>
        Effect.sync(() => {
          expect(s.result.second).toBe(s.result.first)
          expect(s.result.first).toEqual({
            no_delegate_skills: ['project'],
            dispatch_doctrine_skills: ['project-doctrine'],
          })
        })
      ),
    ),
  )
})
