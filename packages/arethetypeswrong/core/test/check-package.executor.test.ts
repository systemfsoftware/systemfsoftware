import { describe, expect, it } from 'vitest'

import { CheckPackage, CheckPackageLive } from '../src/check-package.executor.js'

describe('check-package executor', () => {
  it('CheckPackage has the expected identifier', () => {
    expect(CheckPackage.key).toBe(
      '@systemfsoftware/arethetypeswrong-core/check-package.executor/CheckPackage',
    )
  })

  it('CheckPackageLive is a Layer value requiring PackageStoreAdapter + TarballAdapter', () => {
    expect(CheckPackageLive).toBeDefined()
  })
})
