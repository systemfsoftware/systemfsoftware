import { describe, expect, it } from 'vitest'

describe('surface', () => {
  it('Should_PinExportSet_When_ImportingRoot', async () => {
    const mod = await import('@systemfsoftware/effect-memfs')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root.snap')
  })
})
