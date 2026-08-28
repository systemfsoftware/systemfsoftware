import { describe, expect, it } from 'vitest'

describe('surface', () => {
  it('Should_PinExportSet_When_ImportingRoot', async () => {
    const mod = await import('@systemfsoftware/stryker-js')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root.snap')
  })
  it('Should_PinExportSet_When_ImportingRootChecker', async () => {
    const mod = await import('@systemfsoftware/stryker-js/Checker')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Checker.snap')
  })
  it('Should_PinExportSet_When_ImportingRootEvaluator', async () => {
    const mod = await import('@systemfsoftware/stryker-js/Evaluator')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Evaluator.snap')
  })
  it('Should_PinExportSet_When_ImportingRootExitClass', async () => {
    const mod = await import('@systemfsoftware/stryker-js/ExitClass')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-ExitClass.snap')
  })
  it('Should_PinExportSet_When_ImportingRootIgnorer', async () => {
    const mod = await import('@systemfsoftware/stryker-js/Ignorer')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Ignorer.snap')
  })
  it('Should_PinExportSet_When_ImportingRootMutant', async () => {
    const mod = await import('@systemfsoftware/stryker-js/Mutant')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Mutant.snap')
  })
  it('Should_PinExportSet_When_ImportingRootOutputFile', async () => {
    const mod = await import('@systemfsoftware/stryker-js/output-file')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-output-file.snap')
  })
  it('Should_PinExportSet_When_ImportingRootPlugin', async () => {
    const mod = await import('@systemfsoftware/stryker-js/Plugin')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Plugin.snap')
  })
  it('Should_PinExportSet_When_ImportingRootProvidedOptions', async () => {
    const mod = await import('@systemfsoftware/stryker-js/provided-options')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-provided-options.snap')
  })
  it('Should_PinExportSet_When_ImportingRootReporter', async () => {
    const mod = await import('@systemfsoftware/stryker-js/Reporter')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Reporter.snap')
  })
  it('Should_PinExportSet_When_ImportingRootRun', async () => {
    const mod = await import('@systemfsoftware/stryker-js/Run')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Run.snap')
  })
  it('Should_PinExportSet_When_ImportingRootSchema', async () => {
    const mod = await import('@systemfsoftware/stryker-js/Schema')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-Schema.snap')
  })
  it('Should_PinExportSet_When_ImportingRootTestRunner', async () => {
    const mod = await import('@systemfsoftware/stryker-js/TestRunner')
    await expect(Object.keys(mod).sort()).toMatchFileSnapshot('./__snapshots__/surface.root-TestRunner.snap')
  })
})
