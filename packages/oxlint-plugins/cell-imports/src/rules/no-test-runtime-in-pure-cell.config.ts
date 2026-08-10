import { JSONSchema, Schema as S } from 'effect'

export const DEFAULT_PURE_CELLS = ['workflow', 'kernel', 'schema', 'shape'] as const

export const DEFAULT_TEST_RUNTIMES = ['vitest', '@effect/vitest', 'fast-check'] as const

export const OptionsElement = S.Struct({
  pureCells: S.optionalWith(
    S.Array(S.String).pipe(S.annotations({
      description:
        'Cell suffixes considered pure: a file whose derived cell suffix is in this list may not import a test runtime. Values are bare stems without the leading dot (e.g. "kernel", not ".kernel").',
    })),
    { default: () => [...DEFAULT_PURE_CELLS] },
  ),
  testRuntimes: S.optionalWith(
    S.Array(S.String).pipe(S.annotations({
      description:
        'Module specifiers treated as test runtimes. A specifier that equals an entry or is a subpath of one (entry + "/") is banned; this is how fast-check/x and vitest/config are covered without enumerating them.',
    })),
    { default: () => [...DEFAULT_TEST_RUNTIMES] },
  ),
})

export type OptionsElement = S.Schema.Type<typeof OptionsElement>

export const TEST_RUNTIME_EXPECTED =
  'no runtime dependency on a test runner; a pure cell may reference a test runtime only by type, inside an `if (import.meta.vitest)` guard, or from a test file' as const
export const TEST_RUNTIME_FIX =
  'use `import type`, move the code to a test file or a `.harness.ts` cell, or guard a dynamic import behind `if (import.meta.vitest)`' as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'A pure cell (workflow, kernel, schema, shape by default) cannot import a test runtime (vitest, @effect/vitest, fast-check and their subpaths by default).',
    details: 'The rule binds RUNTIME imports only, and three exemptions carry the design:\n' +
      '1. A type-only import (`import type`, or every specifier type-only) leaves no runtime dependency and is exempt.\n' +
      "2. A dynamic `import()` inside the consequent of an `if (import.meta.vitest)` guard is exempt — it is the repo's sanctioned in-source test block, statically dead in the build (tsdown defines `import.meta.vitest` as `undefined`) and never entered by the published module graph. The guard is detected structurally: the IfStatement test must reference the `import.meta.vitest` member expression, and the import must sit in that IfStatement's consequent. A bare top-level `import()` of a test runtime, without such a guard, reports.\n" +
      '3. A file matching the shared non-production caller set (test/spec files, `__tests__` and sibling directories, observer cells, tooling directories) is exempt regardless of suffix — the same set the sibling `cell-import-boundary` rule uses, so the two rules cannot drift on what counts as non-production.',
  },
  schema: [JSONSchema.make(OptionsElement)],
  messages: {
    forbiddenTestRuntime:
      '{{name}} is forbidden in the {{cell}} cell. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
