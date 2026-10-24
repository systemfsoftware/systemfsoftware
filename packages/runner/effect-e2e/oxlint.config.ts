import recommended from '@systemfsoftware/oxlint-config-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [recommended],
  // Design §7.1-7.3: this package is the Vitest runner package. Its `./runner` entry (src/runner/) ships the
  // `TestRunner` subclass and the `test`/`expect` authoring API; no other entry imports `vitest`.
  settings: { '@systemfsoftware/oxlint-plugin-test-discipline': { role: 'vitest-runner' } },
})
