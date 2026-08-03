export const IO_SOURCE_FILE = /\.(?:acl|store|adapter|handler)\.[cm]?tsx?$/
export const IO_TEST_FILE = /\.(?:acl|store|adapter|handler)\.(?:test|spec)\.[cm]?tsx?$/
export const TEST_FNS: ReadonlySet<string> = new Set(['describe', 'it', 'test'])

export const meta = {
  type: 'problem',
  docs: {
    description:
      'I/O boundary files (acl/store/adapter/handler) are verified by composition tests, never unit tests — not a *.test.ts file and not an in-source `import.meta.vitest` block',
  },
  schema: [],
  messages: {
    inSourceTest:
      "In-source `import.meta.vitest` tests are forbidden in an I/O boundary file (acl/store/adapter/handler). The transform/query/handler IS the file's public purpose — cover it with a composition test. A genuinely private pure helper (e.g. an S.filter predicate) belongs in a *.schema.ts or a named pure helper, tested in-source there.",
    testFile:
      'Unit tests for I/O boundary files (acl/store/adapter/handler) are forbidden — verify these through composition tests with boundary doubles.',
  },
} as const
