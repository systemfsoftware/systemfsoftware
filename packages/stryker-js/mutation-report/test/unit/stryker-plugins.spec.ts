import { describe, expect, it } from 'vitest'

import { PluginKind } from '@stryker-mutator/api/plugin'

// U6 regression: the plugin loader imports the `./stryker-plugins` subpath and
// reads the `strykerPlugins` export under its real name, but tsdown inlines
// the registry's code into a content-hashed shared chunk and mangles the
// re-export unless the subpath entry wrapper preserves it. Build-time gates
// (check:exports, api-extractor) read the emitted .d.mts sidecars, which stay
// correct even when the emitted JS mangles the name — so this test reads the
// BUILT artifact, not the source.
const registryUrl = new URL('../../dist/stryker-plugins.mjs', import.meta.url)

describe('the built stryker-plugins entry', () => {
  it('exposes strykerPlugins under its real name as the five reporter declarations', async () => {
    const { strykerPlugins } = await import(registryUrl.href)
    expect(strykerPlugins).toHaveLength(5)
    for (const plugin of strykerPlugins) {
      expect(plugin.kind).toBe(PluginKind.Reporter)
    }
    expect(strykerPlugins.map((plugin) => plugin.name)).toEqual([
      'clear-text',
      'progress',
      'html',
      'json',
      'progress-stream',
    ])
  })
})
