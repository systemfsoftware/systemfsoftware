/**
 * U6 regression: the plugin loader imports the `./stryker-plugins` subpath and
 * reads the `strykerPlugins` export under its real name, but tsdown inlines the
 * registry's code into a content-hashed shared chunk and mangles the re-export
 * unless the subpath entry wrapper preserves it. Build-time gates
 * (check:exports, api-extractor) read the emitted .d.mts sidecars, which stay
 * correct even when the emitted JS mangles the name - so this lane reads the
 * BUILT artifact, not the source.
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import * as S from 'effect/Schema'
import { expect } from 'vitest'

import { PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'

import { PluginRegistrySchema } from './__fixtures__/stryker-plugins.schema.js'

const decodeRegistry = S.decodeUnknownSync(PluginRegistrySchema)

const Feature = makeFeature({ it, layer })

Feature('Loading the reporter registry from the built package')
  .body(({ scenario }) => {
    scenario(
      'The built subpath exposes every reporter declaration under its real export name',
      Gherkin.Do.pipe(
        Given('the built stryker-plugins subpath of this package')(
          'registryUrl',
          () => Effect.succeed(new URL('../dist/stryker-plugins.mjs', import.meta.url).href),
        ),
        When('the plugin loader imports it the way the tool does')(
          'registry',
          ({ registryUrl }) => Effect.promise(async () => decodeRegistry(await import(registryUrl))),
        ),
        Then('every declaration it finds is a reporter')(({ registry }) =>
          Effect.sync(() => {
            expect(registry.strykerPlugins.map((plugin) => plugin.kind)).toEqual(
              registry.strykerPlugins.map(() => String(PluginKind.Reporter)),
            )
          })
        ),
        Then('the five reporters are named in the order the tool registers them')(({ registry }) =>
          Effect.sync(() => {
            expect(registry.strykerPlugins.map((plugin) => plugin.name)).toEqual([
              'clear-text',
              'progress',
              'html',
              'json',
              'progress-stream',
            ])
          })
        ),
      ),
    )
  })
