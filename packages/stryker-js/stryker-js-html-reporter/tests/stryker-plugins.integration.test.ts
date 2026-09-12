/**
 * U6 regression — ported from `mutation-report`.
 *
 * The original `mutation-report` aggregate exposed five reporters
 * (clear-text, progress, html, json, progress-stream) through a
 * `./stryker-plugins` subpath entry whose wrapper preserves the
 * `strykerPlugins` re-export name against tsdown's shared-chunk
 * mangling. Build-time gates (check:exports, api-extractor) read
 * only the .d.mts sidecars, so they miss a JS-only mangling.
 *
 * After the restructure that package was split: `html-reporter`
 * owns only the html reporter; the other four live as internal
 * factories in `platform-node` (no longer exposed as
 * `strykerPlugins`). This file therefore exercises the successor
 * that still publishes a plugin registry — `html-reporter`'s
 * built `dist/index.mjs` — and asserts its single html entry.
 * The five-reporter aggregate no longer has a single owning
 * package; no single suite can assert all five after the split.
 *
 * Warrant (OP12): regression — U6 build-mangling was invisible to
 * type/exports gates and real lost coverage deleted in the move.
 * Layer: integration/composition over the BUILT artifact, not
 * source.
 *
 * Dynamic import exception (ts-no-dynamic-import): the module
 * specifier is intentionally runtime-selected — the test reads
 * the built artifact via `new URL('../dist/index.mjs',
 * import.meta.url)` to exercise the emit, not source.
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as S from 'effect/Schema'
import { expect } from 'vitest'

import { PluginRegistrySchema } from './__fixtures__/stryker-plugins.schema.js'

// Test/fixture exception to no-sync-schema-codecs: throwing IS the
// assertion for a decoded module namespace arriving as unknown.
const decodeRegistry = S.decodeUnknownSync(PluginRegistrySchema)

const Feature = makeFeature({ it, layer })

Feature('Loading the reporter registry from the built package').body(({ scenario }) => {
  scenario(
    'The built package exposes every reporter declaration under its real export name',
    Gherkin.Do.pipe(
      Given('the built index of this package')(
        'registryUrl',
        () => Effect.succeed(new URL('../dist/index.mjs', import.meta.url).href),
      ),
      When('the plugin loader imports it the way the tool does')('registry', ({ registryUrl }) =>
        // Dynamic import of built artifact — see file header exception.
        Effect.promise(async () => decodeRegistry(await import(registryUrl)))),
      Then('every declaration it finds is a reporter')(({ registry }) =>
        Effect.sync(() => {
          expect(registry.strykerPlugins.map((plugin) => plugin.kind)).toEqual(
            registry.strykerPlugins.map(() => 'Reporter'),
          )
        })
      ),
      Then('the html reporter is named where the tool expects it')(({ registry }) =>
        Effect.sync(() => {
          expect(registry.strykerPlugins.map((plugin) => plugin.name)).toEqual(['html'])
        })
      ),
    ),
  )
})
