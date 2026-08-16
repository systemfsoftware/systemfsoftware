import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

/**
 * The core plugin's `make-boundary.kernel.ts` and this package's copy are one
 * vendored fixture: `effect-workflow` cannot import the core package (plugin
 * packages ship standalone), so the kernel is deliberately mirrored. This test
 * pins the mirror — core edits the kernel, effect-workflow's copy, or vice
 * versa, only with the counterpart updated in the same change.
 */
const KERNEL_PATHS = {
  core: new URL('../../../../core/src/rules/make-boundary.kernel.ts', import.meta.url),
  effectWorkflow: new URL('../make-boundary.kernel.ts', import.meta.url),
}

describe('the mirrored make-boundary kernel', () => {
  it('Should_BeByteIdentical_When_TheTwoPackagesVendorTheSameKernel', () => {
    const coreSource = readFileSync(KERNEL_PATHS.core, 'utf8')
    const workflowSource = readFileSync(KERNEL_PATHS.effectWorkflow, 'utf8')
    expect(coreSource).toBe(workflowSource)
  })
})
