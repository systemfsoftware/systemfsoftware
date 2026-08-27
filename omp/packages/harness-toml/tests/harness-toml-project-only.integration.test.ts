import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { readLayers } from '@systemfsoftware/harness-toml'

const Feature = makeFeature({ it, layer })

Feature('Harness TOML — project-only file with shape and parse tolerance').body(({ scenario }) => {
  scenario(
    'A valid project TOML with two arrays is parsed into both keys',
    {
      scenarioLayer: MemoryFileSystem.layerWith({
        '/test/systemfsoftware.toml': 'plugins = ["one", "two"]\nfoo = ["bar"]',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project at /test with a valid TOML file')('cwd', () => Effect.succeed('/test')),
      When('readLayers is called')('config', (s) => readLayers([`${s.cwd}/systemfsoftware.toml`])),
      Then('both keys appear with their array values')((s) =>
        Effect.sync(() => {
          expect(s.config).toEqual({ plugins: ['one', 'two'], foo: ['bar'] })
        })
      ),
    ),
  )

  scenario(
    'A project with no config file at all returns an empty merged config',
    { scenarioLayer: MemoryFileSystem.layerWith({}) },
    Gherkin.Do.pipe(
      Given('a project at /empty with no TOML file')('cwd', () => Effect.succeed('/empty')),
      When('readLayers is called')('config', (s) => readLayers([`${s.cwd}/systemfsoftware.toml`])),
      Then('the merged config is empty')((s) =>
        Effect.sync(() => {
          expect(s.config).toEqual({})
        })
      ),
    ),
  )

  scenario(
    'A malformed project TOML fails open',
    {
      scenarioLayer: MemoryFileSystem.layerWith({
        '/test/systemfsoftware.toml': 'garbage [[ =\ninvalid',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project at /test with a malformed TOML file')('cwd', () => Effect.succeed('/test')),
      When('readLayers is called')('config', (s) => readLayers([`${s.cwd}/systemfsoftware.toml`])),
      Then('the merged config is empty')((s) =>
        Effect.sync(() => {
          expect(s.config).toEqual({})
        })
      ),
    ),
  )

  scenario(
    'A project TOML whose value types do not match the schema fails open',
    {
      scenarioLayer: MemoryFileSystem.layerWith({
        '/test/systemfsoftware.toml': 'plugins = "not-an-array"',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project at /test whose TOML uses a string where an array is required')(
        'cwd',
        () => Effect.succeed('/test'),
      ),
      When('readLayers is called')('config', (s) => readLayers([`${s.cwd}/systemfsoftware.toml`])),
      Then('the merged config is empty')((s) =>
        Effect.sync(() => {
          expect(s.config).toEqual({})
        })
      ),
    ),
  )
})
