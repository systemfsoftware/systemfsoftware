import { describe, expect, it } from 'vitest'

describe('surface', () => {
  it('Should_PinExportSet_When_ImportingRoot', async () => {
    const mod = await import('@systemfsoftware/effect-atom')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root.snap')
  })
  it('Should_PinExportSet_When_ImportingRootAtom', async () => {
    const mod = await import('@systemfsoftware/effect-atom/Atom')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Atom.snap')
  })
  it('Should_PinExportSet_When_ImportingRootAtomHttpApi', async () => {
    const mod = await import('@systemfsoftware/effect-atom/AtomHttpApi')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-AtomHttpApi.snap')
  })
  it('Should_PinExportSet_When_ImportingRootAtomRef', async () => {
    const mod = await import('@systemfsoftware/effect-atom/AtomRef')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-AtomRef.snap')
  })
  it('Should_PinExportSet_When_ImportingRootAtomRpc', async () => {
    const mod = await import('@systemfsoftware/effect-atom/AtomRpc')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-AtomRpc.snap')
  })
  it('Should_PinExportSet_When_ImportingRootHydration', async () => {
    const mod = await import('@systemfsoftware/effect-atom/Hydration')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Hydration.snap')
  })
  it('Should_PinExportSet_When_ImportingRootRegistry', async () => {
    const mod = await import('@systemfsoftware/effect-atom/Registry')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Registry.snap')
  })
  it('Should_PinExportSet_When_ImportingRootResult', async () => {
    const mod = await import('@systemfsoftware/effect-atom/Result')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Result.snap')
  })
})
