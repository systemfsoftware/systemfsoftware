import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * The core plugin's `MakeBoundary.ts` + `ImportOrigin.ts` and this package's
 * copies are one vendored fixture: `effect-workflow` cannot import the core
 * package (plugin packages ship standalone), so the kernels are deliberately
 * mirrored. This test pins the mirrors — core edits a kernel, effect-workflow's
 * copy, or vice versa, only with the counterpart updated in the same change.
 * `ImportOrigin.ts` is the shared import-origin resolver also mirrored into
 * `effect-schema` and `test-placement`; those mirrors are not pinned here, but
 * any divergence from this file is a contract change that must reach them.
 */
const KERNEL_PATHS = {
  core: new URL('../../../../core/src/rules/MakeBoundary.ts', import.meta.url),
  effectWorkflow: new URL('../MakeBoundary.ts', import.meta.url),
  coreOrigin: new URL('../../../../core/src/rules/ImportOrigin.ts', import.meta.url),
  effectWorkflowOrigin: new URL('../ImportOrigin.ts', import.meta.url),
}

describe('the mirrored make-boundary kernels', () => {
  it('Should_BeByteIdentical_When_TheTwoPackagesVendorTheSameKernel', () => {
    const coreSource = readFileSync(KERNEL_PATHS.core, 'utf8')
    const workflowSource = readFileSync(KERNEL_PATHS.effectWorkflow, 'utf8')
    expect(coreSource).toBe(workflowSource)
  })

  it('Should_BeByteIdentical_When_TheTwoPackagesVendorTheSameImportOrigin', () => {
    const coreSource = readFileSync(KERNEL_PATHS.coreOrigin, 'utf8')
    const workflowSource = readFileSync(KERNEL_PATHS.effectWorkflowOrigin, 'utf8')
    expect(coreSource).toBe(workflowSource)
  })
})
