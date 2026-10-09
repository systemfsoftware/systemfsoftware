# @systemfsoftware/oxlint-plugin-recommended

Shared oxlint presets, shipped as plugin configs. The package registers no rules of its own. Each preset turns on built-in oxlint rules and the rules of the systemfsoftware domain plugins it depends on.

| Config                      | What it turns on                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configs.recommended`       | `dmmf` and `cell-architecture`, plus `oxlint-plugin-test-discipline`, `oxlint-plugin-effect-platform`, the `@effect/tsgo` presets and test-file hygiene |
| `configs.cell-architecture` | `oxlint-plugin-cell-architecture` with type-aware correctness rules                                                                                     |
| `configs.dmmf`              | `oxlint-plugin-dmmf-workflow`, `oxlint-plugin-effect-schema`, strict TypeScript rules and a complexity budget on `src/`                                 |
| `configs.rule-authoring`    | Built-in rules for authoring oxlint plugins; no custom plugin                                                                                           |

## Install

```bash
pnpm add -D @systemfsoftware/oxlint-plugin-recommended oxlint oxlint-tsgolint
```

Wire a preset from your own `oxlint.config.ts`:

```ts
import presets from '@systemfsoftware/oxlint-plugin-recommended'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [presets.configs.recommended],
  ignorePatterns: ['**/dist/**'],
})
```

`extends` carries each preset's `plugins`, `jsPlugins`, `rules`, `overrides`, `categories` and `options`. The presets resolve their `jsPlugins` from this package's own dependencies, so you list no plugin yourself.

## Ignore patterns are yours

The presets carry no `ignorePatterns`. Which paths a repository lints is repository configuration, and oxlint does not merge `ignorePatterns` through `extends` ([oxc#23143](https://github.com/oxc-project/oxc/issues/23143)). Declare them in your own config. oxlint already skips what your `.gitignore` names.

## Companion check: no inline suppressions

The presets set their rules at `error`, but oxlint still obeys an `oxlint-disable` or `eslint-disable` comment, and TypeScript obeys `@ts-expect-error`, `@ts-ignore` and `@ts-nocheck`. A file can switch off the rules that grade it, and no oxlint rule can prevent that, because oxlint honours a disable directive even for the plugin rule that names it.

Pair a preset with the `no-inline-suppression` bin from `@systemfsoftware/oxlint-plugin-test-discipline`. It runs outside oxlint, reads no configuration, and fails on any comment that opens with one of these, in source and test files alike:

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
