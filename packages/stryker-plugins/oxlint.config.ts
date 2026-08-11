import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  rules: {
    // This package publishes a second subpath entry (`./effect-schema-ignorer` ->
    // `./src/effect-schema-ignorer/index.ts`) beside the root `mod.ts` entry, so the
    // default entryPattern (mod.ts only) would judge the subpath barrel as a
    // non-entry and flag its pure-surface re-exports. Both real declared entries
    // must be judged by the entry clause; `src/in-source-test-ignorer/index.ts` is
    // not an entry and must keep being judged by the non-entry clause.
    '@systemfsoftware/oxlint-plugin/entry-surface-or-unit': [
      'error',
      { entryPattern: '(?:^|[\\\\/])(?:mod\\.ts|effect-schema-ignorer[\\\\/]index\\.ts)$' },
    ],
  },
})
