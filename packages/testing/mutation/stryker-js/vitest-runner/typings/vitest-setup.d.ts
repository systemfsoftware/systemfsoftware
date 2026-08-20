import type { MutantCoverage } from '@systemfsoftware/stryker-js-plugin-api/core'
import type { MutantActivation } from '@systemfsoftware/stryker-js-plugin-api/test-runner'

/**
 * Types the context `inject()` reads in `stryker-setup.ts` and the task metadata
 * the report hooks write. Kept in a `.d.ts` so the augmentation is ambient,
 * matching how vitest itself declares `ProvidedContext`.
 */
declare module 'vitest' {
  interface ProvidedContext {
    globalNamespace: '__stryker__' | '__stryker2__'
    hitLimit: number | undefined
    mutantActivation: MutantActivation
    activeMutant: string | undefined
    mode: 'mutant' | 'dry-run'
    isGreaterThanVitest4Point1: boolean
  }
  interface TaskMeta {
    hitCount: number | undefined
    mutantCoverage: MutantCoverage | undefined
  }
}
