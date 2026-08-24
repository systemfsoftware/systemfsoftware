# @systemfsoftware/effect-schema-vite

Vite plugin that auto-discovers Effect Schema exports and injects round-trip property tests via @systemfsoftware/effect-schema-law.

## Install

```sh
pnpm add -D @systemfsoftware/effect-schema-vite @systemfsoftware/effect-schema-law effect vite vitest
```

`@systemfsoftware/effect-schema-law`, `effect`, `vite` and `vitest` are peer dependencies: this package declares them and does not install them, so one copy is shared with the rest of your project. No version is pinned here — the ranges the package accepts are in its manifest, and a version repeated in prose goes stale without anything noticing.

## Entry points

- `@systemfsoftware/effect-schema-vite`

## API

The public surface is generated from the source and versioned with the package: [`etc/effect-schema-vite.api.md`](./etc/effect-schema-vite.api.md).

Options: `InlineSchemaTestsOptions` — `dir` (default `"src"`).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/core/effect/schema/vite#readme).
