import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

// The engine is a mechanical port of upstream api-extractor's compiler-plumbing
// surface (Plan U5: mechanical port, no behavior change — byte-compatible
// reports and rollups are enforced by tests, not lint). The scoped overrides
// below are generated from the live lint surface: each entry relaxes exactly
// the rules that exactly one ported file trips, scoped to that file. Authored
// surfaces (config decode, tokens, verbosity, errors, tests) stay fully gated.
const portedEngineComplexity: string[] = [
  'src/analyzer/**',
  'src/collector/**',
  'src/compiler/**',
  'src/config/**',
  'src/enhancers/**',
  'src/generators/**',
  'src/model/**',
]

export default defineConfig({
  extends: [recommended],
  ignorePatterns: ['tests/e2e/vitest.e2e.config.ts', 'src/**/__tests__/**', 'tests/__fixtures__/**'],
  overrides: [
    {
      files: portedEngineComplexity,
      rules: {
        complexity: ['error', { max: 32, variant: 'modified' }],
      },
    },
    // Per-file relaxations for the ported compiler plumbing. Each rule named
    // here is one the file trips purely because it keeps its upstream shape
    // (AST switches over the full SyntaxKind enum, compiler-internal untyped
    // values, pre-ES2015 `this` aliasing in the ported Span serializer). The
    // repo's authored code carries none of these relaxations.
    {
      files: ['src/analyzer/AstDeclaration.ts'],
      rules: {
        'typescript/no-this-alias': 'off',
        'typescript/no-unnecessary-condition': 'off',
        'typescript/switch-exhaustiveness-check': 'off',
      },
    },
    {
      files: ['src/analyzer/AstSymbolTable.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
        'typescript/no-unnecessary-condition': 'off',
        'typescript/strict-boolean-expressions': 'off',
        'typescript/switch-exhaustiveness-check': 'off',
      },
    },
    {
      files: ['src/analyzer/ExportAnalyzer.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
        'typescript/no-unnecessary-condition': 'off',
        'typescript/strict-boolean-expressions': 'off',
        'typescript/no-unnecessary-type-assertion': 'off',
        'typescript/switch-exhaustiveness-check': 'off',
      },
    },
    {
      files: ['src/analyzer/PackageMetadataManager.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
        'typescript/no-non-null-assertion': 'off',
        'typescript/no-unnecessary-condition': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/strict-boolean-expressions': 'off',
        'typescript/no-unnecessary-type-assertion': 'off',
      },
    },
    {
      files: ['src/analyzer/SourceFileLocationFormatter.ts'],
      rules: {
        'typescript/strict-boolean-expressions': 'off',
      },
    },
    {
      files: ['src/analyzer/AstReferenceResolver.ts'],
      rules: {
        'typescript/strict-boolean-expressions': 'off',
        'typescript/switch-exhaustiveness-check': 'off',
      },
    },
    {
      files: ['src/analyzer/Span.ts'],
      rules: {
        'typescript/no-this-alias': 'off',
        'typescript/strict-boolean-expressions': 'off',
        'typescript/no-unnecessary-condition': 'off',
      },
    },
    {
      files: ['src/analyzer/TypeScriptHelpers.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
        'typescript/no-unnecessary-condition': 'off',
        'typescript/strict-boolean-expressions': 'off',
      },
    },
    {
      files: ['src/analyzer/TypeScriptInternals.ts'],
      // This module exists to read the TypeScript compiler's non-public
      // internals, which are untyped by the compiler's own design.
      rules: {
        'typescript/consistent-type-assertions': 'off',
        'typescript/no-unnecessary-condition': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-return': 'off',
        'typescript/strict-boolean-expressions': 'off',
      },
    },
    {
      files: ['src/collector/Collector.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
        'typescript/no-non-null-assertion': 'off',
        'typescript/no-unnecessary-condition': 'off',
        'typescript/no-unnecessary-type-assertion': 'off',
        'typescript/strict-boolean-expressions': 'off',
        'typescript/switch-exhaustiveness-check': 'off',
        'import/no-cycle': 'off',
      },
    },
    {
      files: ['src/collector/CollectorEntity.ts'],
      // The analyzer↔collector bidirectional lookup (AstDeclaration holds
      // collector metadata; Collector walks AstDeclarations) is the upstream
      // architecture; breaking the cycle would be a redesign, not a port.
      rules: {
        'typescript/no-unnecessary-condition': 'off',
        'typescript/strict-boolean-expressions': 'off',
        'import/no-cycle': 'off',
      },
    },
    {
      files: ['src/collector/SourceMapper.ts'],
      rules: {
        'typescript/consistent-type-assertions': 'off',
        'typescript/strict-boolean-expressions': 'off',
      },
    },
    {
      files: ['src/enhancers/DocCommentEnhancer.ts'],
      rules: {
        'typescript/no-non-null-assertion': 'off',
        'typescript/strict-boolean-expressions': 'off',
      },
    },
    {
      files: ['src/enhancers/ValidationEnhancer.ts'],
      rules: {
        'typescript/strict-boolean-expressions': 'off',
        'typescript/switch-exhaustiveness-check': 'off',
      },
    },
  ],
})
