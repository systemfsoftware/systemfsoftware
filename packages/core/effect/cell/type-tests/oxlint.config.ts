import base from '@systemfsoftware/oxlint-config/base'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [base],

  // `scripts/` is Deno-owned and checked by `pnpm check:scripts` (`deno check` + `deno lint`),
  // the same routing the repo's edit hook applies to a Deno shebang. oxlint's type-aware pass
  // cannot type it: tsc resolves neither the `Deno` global nor Deno's own module graph.
  ignorePatterns: ['scripts/**'],
})
