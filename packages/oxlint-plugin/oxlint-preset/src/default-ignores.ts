/**
 * Paths that are never source. Build output and emitted declarations are the
 * load-bearing entries: an unignored `dist/` makes a type-aware run read
 * generated code and report findings no edit can fix.
 *
 * @public
 */
export const defaultIgnores: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/.stryker-tmp/**',
  '**/*.d.ts',
  '**/*.tsbuildinfo',
]
