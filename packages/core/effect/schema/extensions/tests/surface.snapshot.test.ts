import { describe, expect, it } from 'vitest'

describe('surface', () => {
  it('Should_PinExportSet_When_ImportingRoot', async () => {
    const mod = await import('@systemfsoftware/effect-schema-extensions')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root.snap')
  })
  it('Should_PinExportSet_When_ImportingRootHexSchema', async () => {
    const mod = await import('@systemfsoftware/effect-schema-extensions/hex-schema')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-hex-schema.snap')
  })
})
