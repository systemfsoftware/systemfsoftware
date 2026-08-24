## 2.0.0

### Major Changes

- The plugin now emits only the codec laws. Obligation-coverage assertions ship as a separate plugin.

  `inlineSchemaTests` no longer accepts a `refutationCoverage` option, and the suite it generates never names the refusal surface — nothing beyond this plugin's own peers has to be installed for that suite to run.

  To keep the coverage assertion, install the companion plugin and list it beside this one:

  ```sh
  pnpm add -D @systemfsoftware/effect-schema-refutation-vite
  ```

  ```ts
  import { inlineRefutationCoverage } from '@systemfsoftware/effect-schema-refutation-vite'
  import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'
  import { defineConfig } from 'vitest/config'

  export default defineConfig({
    plugins: [inlineSchemaTests(), inlineRefutationCoverage()],
  })
  ```

  Each plugin generates its own test file, so the two compose without either overwriting the other's.

### Patch Changes

- Updated dependencies:
  - @systemfsoftware/effect-schema-law@1.0.0
