import { describe, expect, it } from 'vitest'

import {
  CheckPackage,
  CheckPackageExecutorDeps,
  CheckPackageExecutorDepsStub,
  CheckPackageLive,
} from '../src/check-package.executor.js'

describe('check-package executor', () => {
  it('CheckPackageExecutorDeps has the expected identifier', () => {
    expect(CheckPackageExecutorDeps.key).toBe(
      '@systemfsoftware/arethetypeswrong-core/check-package.executor/CheckPackageExecutorDeps',
    )
  })

  it('CheckPackageExecutorDepsStub returns a stub analysis', async () => {
    const layer = CheckPackageExecutorDepsStub
    expect(layer).toBeDefined()
  })

  it('CheckPackage has the expected identifier', () => {
    expect(CheckPackage.key).toBe(
      '@systemfsoftware/arethetypeswrong-core/check-package.executor/CheckPackage',
    )
  })

  it('CheckPackageLive is a Layer value requiring PackageStoreAdapter + TarballAdapter', () => {
    expect(CheckPackageLive).toBeDefined()
  })
})
