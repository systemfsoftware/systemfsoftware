# @systemfsoftware/all

Complete [oxlint](https://oxc.rs/docs/guide/usage/linter.html) preset for Effect-TS and the functional core / imperative shell architecture.

Extends oxlint with custom rule plugins for Effect domain modelling, schema boundaries, test placement, property-based testing, entrypoint termination, and cell vocabulary — pre-configured with type awareness and correctness defaults in a single import.

## Install

```sh
pnpm add -D @systemfsoftware/all effect oxlint oxlint-tsgolint typescript
```

`effect`, `oxlint`, `oxlint-tsgolint`, and `typescript` are peer dependencies so your project controls its own versions. `oxlint-tsgolint` is the type-aware evaluation engine required for semantic rules (e.g. boundary assertions and schema codecs).

## Quick Start

Export the preset from your `oxlint.config.ts`:

```ts
// oxlint.config.ts
import all from '@systemfsoftware/all'

export default all
```

Run oxlint against your project:

```sh
pnpm oxlint
```

> [!NOTE]
> Type-aware rules require a `tsconfig.json` covering the files being linted. Without type information, type-dependent rules are skipped.

## What's Included

The preset registers and enables four custom plugin suites alongside stock oxlint correctness rules at `error`:

### Custom Rule Plugins

| Plugin                                             | Scope                      | Key Invariants Enforced                                                                                                                                                     |
| -------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@systemfsoftware/oxlint-plugin`                   | Core Effect & architecture | Ban native `Date.now()`, `Map`, `Set`, `setTimeout`, and `Promise` inside Effect blocks; require structured errors over string errors; forbid boundary tests in unit suites |
| `@systemfsoftware/oxlint-plugin-cell-vocabulary`   | Cell architecture          | Enforce kernel/executor boundary conventions and domain naming structures by walking cell descriptions                                                                      |
| `@systemfsoftware/oxlint-plugin-effect-dmmf`       | DMMF aggregate suite       | Bundles schema codec checks, workflow step structure, property-based test isolation, and test hygiene                                                                       |
| `@systemfsoftware/oxlint-plugin-effect-entrypoint` | Application runtime        | Require explicit top-level runtime entrypoints (`runMain`, `ManagedRuntime`) and forbid leaking intermediate runtimes                                                       |

### Stock Namespaces & Defaults

- **`categories`**: `correctness: 'error'`
- **Registered namespaces**: `oxc`, `typescript`, `import`, `unicorn`, `vitest`, `jsdoc`, `node`, `promise`
- **Default ignore patterns**: `dist/**`, `build/**`, `coverage/**`, `**/*.d.ts`, `.turbo/**`, `.stryker-tmp/**`

## Composition & Customization

If you need to override rules or extend existing settings, import individual configuration blocks or spread the preset:

```ts
// oxlint.config.ts
import all, { ignorePatterns, plugins, rules } from '@systemfsoftware/all'

export default {
  ...all,
  ignorePatterns: [...ignorePatterns, 'generated/**'],
  rules: {
    ...rules,
    // downgrade or customize specific rules
    '@systemfsoftware/oxlint-plugin/no-logging-in-catch': 'warn',
  },
}
```

## Contributing

Development setup and repo workflow: [AGENTS.md](../../../AGENTS.md).

## License

[Apache-2.0](LICENSE). Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware).
