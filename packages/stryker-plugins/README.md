# @systemfsoftware/stryker-plugins

[Stryker](https://stryker-mutator.io) mutation-testing plugins for [Effect](https://effect.website).

## `effect-schema-ignorer`

A Stryker **Ignore** plugin (`effect-schema-declarations`) that skips the _equivalent_ mutants on Effect `Schema` declarations — mutations that change source without changing behaviour, so no test can ever kill them. It recognizes and ignores:

- brand descriptions in `Symbol.for('…')`,
- `Schema.TaggedClass` / `Schema.TaggedError` `_tag` identifiers,
- the field schemas of those declarations.

Schema declarations are **data, not behaviour** (Constitution Article III §4) — mutating them produces unkillable equivalent mutants that drag a mutation score below 100% for no real coverage gap. This plugin removes that noise so the score reflects logic.

## Usage

```bash
pnpm add -D @systemfsoftware/stryker-plugins
```

In `stryker.config.json`:

```jsonc
{
  "plugins": [
    "@stryker-mutator/vitest-runner",
    "@stryker-mutator/typescript-checker",
    "@systemfsoftware/stryker-plugins"
  ],
  "ignorers": ["effect-schema-declarations"]
}
```

> [!NOTE]
> `@stryker-mutator/api` is a peer dependency — your Stryker install provides it. `effect` is a direct dependency (the plugin decodes AST nodes with `Schema`).
