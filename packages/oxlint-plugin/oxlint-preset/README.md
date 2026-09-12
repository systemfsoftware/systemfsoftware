# @systemfsoftware/oxlint-preset

Canonical oxlint preset roots: the very strict canonical set for product code and the instrument set for the `oxlint-plugin` subtree, composed from self-registering plugin fragments.

## Install

```sh
pnpm add @systemfsoftware/oxlint-preset
```

## Entry points

- `@systemfsoftware/oxlint-preset` — the canonical set for product code: the recommended stock tier, the ten leaf fragments (effect-native, tag-discipline, structure, effect-schema, effect-workflow, property-testing, test-hygiene, test-placement, cell-vocabulary, effect-entrypoint), the correctness category at `error`, and the three rules that decide complexity in the pure core: the two complexity ceilings and `no-ternary` are CONST-P2 expression law (a branch is an untested path where state diverges), and `typescript/switch-exhaustiveness-check` requires exhaustive dispatch over closed unions.
- `@systemfsoftware/oxlint-preset/instrument` — the same recommended tier with no product rules of its own, for a package whose subject is the linter rather than the product.

## Use

```ts
// oxlint.config.ts
import preset from '@systemfsoftware/oxlint-preset'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [preset],
})
```

The instrument root, for a package that lints its own rule sources:

```ts
import instrument from '@systemfsoftware/oxlint-preset/instrument'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [instrument],
})
```

Type awareness is on, so a consumer needs a `tsconfig.json` that includes the files being linted; rules that need types produce no diagnostics without it and say nothing about being inert.

## defaultIgnores

`defaultIgnores` is the nine-glob list of paths that are never source — build output, coverage, generated declarations and incremental build state. Compose it into a config that does not extend one of the roots.

## API

The public surface is generated from the source and versioned with the package: [`etc/oxlint-preset.api.md`](./etc/oxlint-preset.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/oxlint-plugin/oxlint-preset#readme).
