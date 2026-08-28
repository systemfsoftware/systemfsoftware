import { parse, stringify } from '@std/toml'
import { it, layer } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { MemoryFileSystem } from '@systemfsoftware/effect-memfs'
import { Effect, Schema } from 'effect'
import { expect } from 'vitest'

import { PolicySchema, readLayers } from '@systemfsoftware/harness-toml'

const Feature = makeFeature({ it, layer })

Feature('Harness TOML — PolicyFromToml codec round-trip').body(({ scenario }) => {
  scenario(
    'A policy survives a full serialize-and-parse round trip',
    {
      scenarioLayer: MemoryFileSystem.layerWith({}),
    },
    Gherkin.Do.pipe(
      Given('a TOML document')('doc', () => Effect.succeed('plugins = ["a", "b"]\nfoo = ["bar"]')),
      When('the document is parsed and re-serialized')('roundTripped', (s) =>
        Effect.gen(function*() {
          const parsed = parse(s.doc)
          const decoded = yield* Schema.decodeUnknownEffect(PolicySchema)(parsed).pipe(Effect.orDie)
          const encoded = stringify(decoded)
          const reparsed = parse(encoded)
          return yield* Schema.decodeUnknownEffect(PolicySchema)(reparsed).pipe(Effect.orDie)
        })),
      Then('the round-tripped policy equals the first decode')((s) =>
        Effect.gen(function*() {
          const first = yield* Schema.decodeUnknownEffect(PolicySchema)(parse(s.doc)).pipe(Effect.orDie)
          expect(s['roundTripped']).toEqual(first)
        })
      ),
    ),
  )

  scenario(
    'An unparseable TOML document fails open',
    {
      scenarioLayer: MemoryFileSystem.layerWith({
        '/proj/systemfsoftware.toml': 'not a toml document [[[ =',
      }),
    },
    Gherkin.Do.pipe(
      Given('a project with an unparseable TOML file')('cwd', () => Effect.succeed('/proj')),
      When('readLayers is called on that file')('config', () => readLayers(['/proj/systemfsoftware.toml'])),
      Then('the merged config is empty')((s) =>
        Effect.sync(() => {
          expect(s.config).toEqual({})
        })
      ),
    ),
  )
})
