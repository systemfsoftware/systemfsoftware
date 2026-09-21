/**
 * The specifiers whose modules perform filesystem, process-spawning or network
 * work. The predicate keys on a *call* against a non-type import from one of
 * these — the import alone never decides anything, because a type-only import
 * is erased at runtime and performs nothing.
 *
 * `path` is deliberately absent: it is pure string math and performs no I/O.
 *
 * The effect-group entries carry both spellings an adopter can be on, because
 * platform moved: v4 merges it into the main package (`effect/FileSystem`,
 * verified in-tree across `effect-memfs`, `arethetypeswrong/cli` and
 * `omp-claude-compat`, including a generated api report), while v3 ships it as
 * `@effect/platform/...`. Both are live for someone installing this rule.
 */
export const IO_SPECIFIERS: Record<string, true> = {
  // node builtins performing filesystem, process or network work
  fs: true,
  'node:fs': true,
  'node:fs/promises': true,
  child_process: true,
  'node:child_process': true,
  net: true,
  http: true,
  https: true,
  dns: true,
  'node:net': true,
  'node:http': true,
  'node:https': true,
  'node:dns': true,
  // effect v4 — platform merged into the main package
  'effect/FileSystem': true,
  'effect/unstable/process/ChildProcessSpawner': true,
  // effect v3 — platform as its own package, still what many adopters are on
  '@effect/platform/FileSystem': true,
  '@effect/platform/CommandExecutor': true,
  '@effect/platform-node': true,
  '@effect/platform-node/NodeFileSystem': true,
  '@effect/platform-node-shared/NodeFileSystem': true,
} as const

export const IO_SOURCE_TEST_NAME = 'An in-source `import.meta.vitest` test block' as const
export const IO_SOURCE_TEST_EXPECTED =
  'the tests of a module whose own source calls an I/O binding to live outside it — a separate test file, or a composition test with a double at the port' as const
export const IO_SOURCE_TEST_ACTUAL =
  'this module calls a binding imported from a filesystem, process or network module and guards tests in-source with `import.meta.vitest`' as const
export const IO_SOURCE_TEST_FIX =
  "test the module from outside its own source — a separate test file or a composition test doubling the boundary — or, when an assertion merely restates a literal the module already computes, it is a change detector: delete it. The verdict here is the file's own imports and calls, never its name" as const

export const meta = {
  type: 'problem',
  docs: {
    description:
      'Reports an in-source `import.meta.vitest` test block in a module whose own syntax shows a called, non-type import from a filesystem, process or network module. Judges only the in-source-test idiom — a module whose tests live in separate files is a no-op for this rule, whatever it imports.',
  },
  schema: [],
  messages: {
    ioSourceTest: '{{name}} is forbidden. Expected: {{expected}}. Actual: {{actual}}. Fix: {{fix}}.',
  },
} as const
