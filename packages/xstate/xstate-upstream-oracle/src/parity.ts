import { ParityRow, RetiredCase } from './disposition.schema.js'

/**
 * The two lane files whose unedited upstream form cannot run under this repo's
 * toolchain, each replaced by a fork-owned test (R4, CONST-W3):
 * - `declarations.test.ts` drove TypeScript 5 emit; the fork's own gate is
 *   `tests/declaration-emit.test.ts`, which compiles with the repo's TypeScript.
 * - `propertySuite.test.ts` declared a suite inside a running test (vitest 3);
 *   vitest 5 refuses it, so the re-homed test declares the suite at collection.
 */
export const RETIRED: ReadonlyArray<RetiredCase> = [
  RetiredCase.make({
    file: 'test/declarations.test.ts',
    package: 'xstate',
    replacementFile: 'packages/xstate/xstate/tests/declaration-emit.test.ts',
    reason: 'toolchain: TypeScript 7 emit replaces the TypeScript 5 declaration-emit suite',
  }),
  RetiredCase.make({
    file: 'test/engine/propertySuite.test.ts',
    package: 'xstate-test',
    replacementFile: 'packages/xstate/xstate-test/tests/property-suite.replacement.test.ts',
    reason: 'toolchain: vitest 5 refuses a suite declared inside a running test',
  }),
]

/** U3's in-tree counts, the parity target the lane's held + replacement counts must equal. */
export const PARITY: ReadonlyArray<ParityRow> = [
  ParityRow.make({ package: 'xstate', files: 145, passed: 2420, skipped: 29, todo: 3 }),
  ParityRow.make({ package: 'xstate-effect', files: 7, passed: 135, skipped: 0, todo: 0 }),
  ParityRow.make({ package: 'xstate-test', files: 38, passed: 478, skipped: 0, todo: 0 }),
  ParityRow.make({ package: 'xstate-react', files: 8, passed: 141, skipped: 0, todo: 0 }),
  ParityRow.make({ package: 'xstate-store', files: 9, passed: 294, skipped: 0, todo: 0 }),
  ParityRow.make({ package: 'xstate-store-react', files: 2, passed: 24, skipped: 0, todo: 0 }),
]
