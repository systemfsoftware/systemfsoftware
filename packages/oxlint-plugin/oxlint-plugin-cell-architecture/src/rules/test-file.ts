/**
 * Test files exercise decisions as fixtures; the regime binds production code.
 * Byte-identical to the sibling plugin's pattern in
 * `oxlint-plugin-dmmf-workflow/src/rules/workflow-match-exhaustive.config.ts`,
 * which `oxlint-plugin-cell-architecture` cannot import: that package exports
 * only its plugin entry, so its rule configs are not importable paths.
 */
export const TEST_FILE_PATTERN = /\.(test|spec|property\.test|tst)\.[cm]?tsx?$/u

export const isTestFile = (filename: string): boolean => TEST_FILE_PATTERN.test(filename)
