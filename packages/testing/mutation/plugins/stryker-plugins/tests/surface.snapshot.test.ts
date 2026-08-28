import { describe, expect, it } from 'vitest'

describe('surface', () => {
  it('Should_PinExportSet_When_ImportingRoot', async () => {
    const mod = await import('@systemfsoftware/stryker-plugins')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root.snap')
  })
  it('Should_PinExportSet_When_ImportingRootEffectSchemaIgnorer', async () => {
    const mod = await import('@systemfsoftware/stryker-plugins/effect-schema-ignorer')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-effect-schema-ignorer.snap')
  })
  it('Should_PinExportSet_When_ImportingRootInSourceTestIgnorer', async () => {
    const mod = await import('@systemfsoftware/stryker-plugins/in-source-test-ignorer')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot(
      './__snapshots__/surface.root-in-source-test-ignorer.snap',
    )
  })
  it('Should_PinExportSet_When_ImportingRootWorkflowMakeIgnorer', async () => {
    const mod = await import('@systemfsoftware/stryker-plugins/workflow-make-ignorer')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-workflow-make-ignorer.snap')
  })
})
