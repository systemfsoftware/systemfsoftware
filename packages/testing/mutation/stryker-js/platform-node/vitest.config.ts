import { fileURLToPath } from 'node:url'

import { defineConfig, sharedConfig } from '@systemfsoftware/vitest-config'

const src = fileURLToPath(new URL('./src/', import.meta.url))

export default defineConfig({
  test: {
    ...sharedConfig.test,
    // The behaviour lane lives in `tests` as Gherkin integration features;
    // in-source unit tests run through `import.meta.vitest` blocks. The pure
    // decisions carry `src/**/__tests__` property suites, which match neither
    // of those patterns and so must be named here to run at all.
    include: ['tests/**/*.integration.test.ts', 'src/**/__tests__/*.test.ts'],

    includeSource: ['src/**/*.ts'],
  },
  resolve: {
    // Prefer live source over `dist/` for every workspace dependency, so a test
    // never silently exercises the previous build.
    conditions: ['@systemfsoftware/source', 'source', 'import', 'node', 'default'],

    alias: [
      {
        // The integration tests import this package through its own subpath
        // exports — `@systemfsoftware/stryker-js-mutation-run/verdict-envelope` —
        // which is the specifier an adopter writes, so it is the one worth
        // exercising. Node resolves such a self-reference from `name` plus
        // `exports` with no symlink involved, but Vite's resolver does not
        // implement self-reference at all: it looks for a real package
        // directory, finds none, and reports "Cannot find package". Without this
        // the whole suite fails to import until someone runs a build, and then
        // tests the build instead of the source.
        find: /^@systemfsoftware\/stryker-js-mutation-run\/(.*)$/u,
        replacement: `${src}$1.ts`,
      },
    ],
  },
})
