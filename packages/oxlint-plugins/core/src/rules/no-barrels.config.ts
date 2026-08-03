import { JSONSchema, Schema as S } from 'effect'

export const Options = S.Struct({
  severity: S.optionalWith(
    S.Literal('error', 'warn', 'off'),
    { default: () => 'error' },
  ),
  excludeRoot: S.optionalWith(
    S.Boolean,
    { default: () => true },
  ),
})

export const BARREL_BASENAMES: ReadonlySet<string> = new Set([
  'index.ts',
  'index.tsx',
  'mod.ts',
  'mod.tsx',
])

export const BARREL_LAST_PARTS: ReadonlySet<string> = new Set([
  'index',
  'index.js',
  'index.jsx',
  'index.ts',
  'index.tsx',
  'mod',
  'mod.js',
  'mod.jsx',
  'mod.ts',
  'mod.tsx',
])

export const meta = {
  type: 'suggestion',
  docs: {
    description: 'Detect barrel files (index.ts/mod.ts with re-exports) and barrel imports',
  },
  hasSuggestions: false,
  schema: [JSONSchema.make(Options)],
  messages: {
    barrelFile:
      'Barrel file detected. Expected: Direct imports from specific modules. Actual: Re-exporting from multiple modules. Fix: Import directly from specific modules.',
    reExportAll:
      '{{source}} is forbidden. Expected: Direct import from specific module. Actual: `export * from "{{source}}"`. Fix: Import directly from specific modules.',
    reExportNamed:
      '{{source}} is forbidden. Expected: Direct import from specific module. Actual: `export {{specifiers}} from "{{source}}"`. Fix: Import directly from specific modules.',
    barrelImport:
      '{{path}} is forbidden. Expected: Direct module path. Actual: Barrel import from "{{path}}". Fix: Import directly from the specific module.',
  },
} as const
