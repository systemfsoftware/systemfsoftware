import { MESSAGE } from './path.config.js'

export const VITEST_IMPORT_NAME = 'a vitest import inside an adopting module' as const
export const VITEST_IMPORT_EXPECTED =
  'a module whose only test dependency is the catalog laws call inside the guard' as const
export const VITEST_IMPORT_ACTUAL =
  'this module imports the test runner statically or dynamically, so the module runs — or fails to load — outside a test run' as const
export const VITEST_IMPORT_FIX = 'delete the import; the laws call brings its own runner inside the guard' as const

export const TEST_VOCABULARY_NAME = 'hand-authored test vocabulary in src' as const
export const TEST_VOCABULARY_EXPECTED = 'in-source coverage authored only through the catalog laws channel' as const
export const TEST_VOCABULARY_ACTUAL =
  'this `describe`/`it`/`test`/`expect` call is an example assertion written by hand, the ceremony shape the laws channel replaces' as const
export const TEST_VOCABULARY_FIX =
  'express the coverage as a law — a refuse-home property or a published contract case — or move it to the external test tree' as const

export const SNAPSHOT_ASSERTION_NAME = 'an inline snapshot assertion in src' as const
export const SNAPSHOT_ASSERTION_EXPECTED =
  'expectations authored against a published contract, not captured output' as const
export const SNAPSHOT_ASSERTION_ACTUAL =
  'this snapshot assertion captures whatever the module currently produces, so a regression re-baselines itself' as const
export const SNAPSHOT_ASSERTION_FIX = 'delete the snapshot or replace it with a published-contract law' as const

export const NON_CANONICAL_GUARD_NAME = 'a non-canonical `import.meta.vitest` reference' as const
export const NON_CANONICAL_GUARD_EXPECTED =
  'the canonical guard `if (import.meta.vitest !== void 0)` and nothing else' as const
export const NON_CANONICAL_GUARD_ACTUAL =
  'this reference to `import.meta.vitest` is not the canonical guard form, so vitest collects the file by text while the code inside never runs as a law' as const
export const NON_CANONICAL_GUARD_FIX =
  'replace it with the canonical guard wrapping a laws call, or delete the reference' as const

export const GUARD_BODY_NOT_LAWS_NAME = 'a guard body that holds something other than laws calls' as const
export const GUARD_BODY_NOT_LAWS_EXPECTED = 'only `await catalog.laws(...)` calls inside the guard' as const
export const GUARD_BODY_NOT_LAWS_ACTUAL =
  'this statement inside the guard is hand-authored test code, which the laws channel exists to replace' as const
export const GUARD_BODY_NOT_LAWS_FIX = 'move the coverage into a law or out of src entirely' as const

export const COMMENT_TOKEN_NAME = 'the collection token in a comment' as const
export const COMMENT_TOKEN_EXPECTED = 'no `import.meta.vitest` text outside live code' as const
export const COMMENT_TOKEN_ACTUAL =
  'vitest collects files by matching the guard token as text, so this comment makes the module load in test runs while certifying nothing' as const
export const COMMENT_TOKEN_FIX = 'delete the comment or the module it decorates' as const

export const GLOBAL_AUGMENTATION_NAME = 'a local `ImportMeta` augmentation' as const
export const GLOBAL_AUGMENTATION_EXPECTED = 'the type system untouched; adoption declared in package config' as const
export const GLOBAL_AUGMENTATION_ACTUAL =
  'this `declare global` adds `vitest` to `ImportMeta`, reopening the per-module escape the package-level adoption boundary closed' as const
export const GLOBAL_AUGMENTATION_FIX = 'delete the augmentation' as const

export const EXPORTED_CALLEE_NAME = 'a `run` bound to an exported or imported callee' as const
export const EXPORTED_CALLEE_EXPECTED = 'each law bound to a callee that is module-private' as const
export const EXPORTED_CALLEE_ACTUAL =
  'this `run` reaches an exported function, so integration tests could cover it directly and the law adds no reachability' as const
export const EXPORTED_CALLEE_FIX =
  'make the decision core module-private, or cover it from the external test tree' as const

export const LAWS_OBJECT = 'catalog'
export const LAWS_METHOD = 'laws'

export const SNAPSHOT_MATCHERS: Record<string, true> = {
  toMatchInlineSnapshot: true,
  toMatchSnapshot: true,
  toThrowInlineSnapshot: true,
}

export const TEST_VOCABULARY_CALLS: Record<string, true> = {
  describe: true,
  it: true,
  test: true,
  expect: true,
}

export const VITEST_SOURCE_PREFIXES: readonly string[] = ['vitest', 'vitest/', '@effect/vitest', '@effect/vitest/']

export const GUARD_TOKEN_PATTERN = /import\.meta\.vitest/

export const meta = {
  type: 'problem',
  docs: {
    description:
      'In adopting packages, src authors in-source coverage only through the catalog laws channel inside the canonical guard: no vitest imports, no hand test vocabulary, no snapshots, no non-canonical guard references, no comment-form tokens, no local ImportMeta augmentation, and every `run` bound to a module-private callee. Inert outside src/.',
  },
  schema: [],
  messages: {
    vitestImport: MESSAGE,
    testVocabulary: MESSAGE,
    snapshotAssertion: MESSAGE,
    nonCanonicalGuard: MESSAGE,
    guardBodyNotLaws: MESSAGE,
    commentToken: MESSAGE,
    globalAugmentation: MESSAGE,
    exportedCallee: MESSAGE,
  },
} as const
