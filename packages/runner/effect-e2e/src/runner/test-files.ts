import { DEFAULT_TESTS } from '../Config/config.schema.js'

/**
 * The files a suite's `vitest.config.ts` collects, shared with `effect-e2e run` so the two cannot drift
 * (requirements FR-12, AC-2.7, AC-12.5): every `.e2e.ts` under `tests/`, never fixtures or the run output.
 */
export const e2eTestFiles = {
  include: DEFAULT_TESTS,
  exclude: ['tests/__fixtures__/**', '.e2e/**'],
} as const
