import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { readLayers } from '@systemfsoftware/harness-toml'

const Feature = makeFeature({ it, layer })

const HOME = '/home/test'

const userPath = `${HOME}/.config/systemfsoftware/systemfsoftware.toml`
const projectPath = '/proj/systemfsoftware.toml'
const localPath = '/proj/systemfsoftware.local.toml'

Feature('Harness TOML — three-layer config with per-key override').body(({ scenario }) => {
  scenario(
    'Should merge user and project when keys are disjoint',
    {
      scenarioLayer: MemoryFileSystem.layerWith({
        [userPath]: 'no_delegate_skills = ["user-skill"]',
        [projectPath]: 'dispatch_doctrine_skills = ["project-skill"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project at /proj')('cwd', () => Effect.succeed('/proj')),
      When('readLayers is called')('config', () => readLayers([userPath, projectPath, localPath])),
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
      scenarioLayer: MemoryFileSystem.layerWith({
        [userPath]: 'no_delegate_skills = ["user"]',
        [projectPath]: 'no_delegate_skills = ["project"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('user and project layers setting the same key')('cwd', () => Effect.succeed('/proj')),
      When('readLayers is called')('config', () => readLayers([userPath, projectPath, localPath])),
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
      scenarioLayer: MemoryFileSystem.layerWith({
        [projectPath]: 'no_delegate_skills = ["project"]',
        [localPath]: 'no_delegate_skills = ["local"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('project and local layers setting the same key')('cwd', () => Effect.succeed('/proj')),
      When('readLayers is called')('config', () => readLayers([userPath, projectPath, localPath])),
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
      scenarioLayer: MemoryFileSystem.layerWith({
        [userPath]: 'no_delegate_skills = ["user"]',
        [localPath]: 'no_delegate_skills = ["local"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('user and local layers setting the same key')('cwd', () => Effect.succeed('/proj')),
      When('readLayers is called')('config', () => readLayers([userPath, projectPath, localPath])),
      Then('the local value wins')((s) =>
        Effect.sync(() => {
          expect(s.config['no_delegate_skills']).toEqual(['local'])
        })
      ),
    ),
  )

  scenario(
    'Should return empty when all layers are missing',
    { scenarioLayer: MemoryFileSystem.layerWith({}) },
    Gherkin.Do.pipe(
      Given('no user, project, or local file')('cwd', () => Effect.succeed('/empty')),
      When('readLayers is called')('config', () => readLayers([userPath, projectPath, localPath])),
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
      scenarioLayer: MemoryFileSystem.layerWith({
        [userPath]: 'no_delegate_skills = ["only-user"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('only the user layer is present')('cwd', () => Effect.succeed('/proj')),
      When('readLayers is called')('config', () => readLayers([userPath, projectPath, localPath])),
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
      scenarioLayer: MemoryFileSystem.layerWith({
        [userPath]: 'plugins = ["a", "b", "c"]',
        [projectPath]: 'plugins = ["only-this-one"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('user sets a three-element array and project overrides')('cwd', () => Effect.succeed('/proj')),
      When('readLayers is called')('config', () => readLayers([userPath, projectPath, localPath])),
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
      scenarioLayer: MemoryFileSystem.layerWith({
        [userPath]: 'no_delegate_skills = ["user"]',
        [projectPath]: 'garbage [[ =\ninvalid',
      }),
    },
    Gherkin.Do.pipe(
      Given('user layer is valid and project is malformed')('cwd', () => Effect.succeed('/proj')),
      When('readLayers is called')('config', () => readLayers([userPath, projectPath, localPath])),
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
      scenarioLayer: MemoryFileSystem.layerWith({
        [userPath]: 'garbage [[ =\ninvalid',
        [projectPath]: 'no_delegate_skills = ["project"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('user layer is malformed and project is valid')('cwd', () => Effect.succeed('/proj')),
      When('readLayers is called')('config', () => readLayers([userPath, projectPath, localPath])),
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
      scenarioLayer: MemoryFileSystem.layerWith({
        [projectPath]: 'no_delegate_skills = ["project"]',
        [localPath]: 'garbage [[ =\ninvalid',
      }),
    },
    Gherkin.Do.pipe(
      Given('project is valid and local is malformed')('cwd', () => Effect.succeed('/proj')),
      When('readLayers is called')('config', () => readLayers([userPath, projectPath, localPath])),
      Then('project still wins')((s) =>
        Effect.sync(() => {
          expect(s.config['no_delegate_skills']).toEqual(['project'])
        })
      ),
    ),
  )
})
