# @systemfsoftware/oxlint-config-dmmf

Shareable Oxlint configuration for DMMF: pure workflows, Effect Schema laws, property testing, and bounded cyclomatic complexity.

## Install

```bash
pnpm add -D oxlint oxlint-tsgolint typescript effect @systemfsoftware/oxlint-config-dmmf
```

## Usage

```ts
// oxlint.config.ts
import dmmf from '@systemfsoftware/oxlint-config-dmmf'
import { defineConfig } from 'oxlint'

export default defineConfig({ extends: [dmmf] })
```

## Companion check: no inline suppressions

The preset sets its rules at `error`, but oxlint still obeys an `oxlint-disable` or `eslint-disable` comment, and TypeScript obeys `@ts-expect-error`, `@ts-ignore` and `@ts-nocheck`. A file can switch off the rules that grade it, and no oxlint rule can prevent that, because oxlint honours a disable directive even for the plugin rule that names it.

Pair the preset with the `no-inline-suppression` bin from `@systemfsoftware/oxlint-plugin-test-discipline`. It runs outside oxlint, reads no configuration, and fails on any comment that opens with one of these, in source and test files alike:

- `oxlint-disable`, `oxlint-disable-line`, `oxlint-disable-next-line`
- `eslint-disable`, `eslint-disable-line`, `eslint-disable-next-line`
- `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-test-discipline
```

```json
{
  "scripts": {
    "lint": "oxlint . && no-inline-suppression"
  }
}
```

With no arguments it scans every git-tracked `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` and `.cjs` file under the working directory. It exits `0` when clean and `1` on any finding, printing each one as `file:line:column`.

## License

[Apache-2.0](LICENSE)
