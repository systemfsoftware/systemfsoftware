import { describe, expect, it } from 'vitest'

describe('surface', () => {
  it('Should_PinExportSet_When_ImportingRoot', async () => {
    const mod = await import('@systemfsoftware/stryker-js-platform-node')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root.snap')
  })
  it('Should_PinExportSet_When_ImportingRootBuiltinReporters', async () => {
    const mod = await import('@systemfsoftware/stryker-js-platform-node/builtin-reporters')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-builtin-reporters.snap')
  })
  it('Should_PinExportSet_When_ImportingRootConfigBase', async () => {
    const mod = await import('@systemfsoftware/stryker-js-platform-node/config/base')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-config-base.snap')
  })
})
