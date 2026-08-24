# @systemfsoftware/effect-schema-refutation-vite

Vite plugin that asserts every obligation reachable from an exported Effect Schema is refuted — the obligation-coverage half of `effect-schema-vite`.

## Install

```sh
pnpm add -D @systemfsoftware/effect-schema-refutation-vite @systemfsoftware/effect-schema-law effect vite vitest
```

`@systemfsoftware/effect-schema-law`, `effect`, `vite` and `vitest` are peer dependencies: this package declares them and does not install them, so one copy is shared with the rest of your project.

This plugin is installed **alongside**, not instead of, `@systemfsoftware/effect-schema-vite`. The two plugins write different generated files and compose in your Vitest config:

```ts
// vitest.config.ts
import { inlineRefutationCoverage } from '@systemfsoftware/effect-schema-refutation-vite'
import { inlineSchemaTests } from '@systemfsoftware/effect-schema-vite'

export default defineConfig({
  plugins: [inlineSchemaTests(), inlineRefutationCoverage()],
})
```

`inlineSchemaTests` writes `src/schema-laws.test.ts` (round-trip laws). `inlineRefutationCoverage` writes `src/schema-refutations.test.ts` (obligation coverage) — two plugins rewriting one path would collide and lose one suite, so they each own their file.

The generated `schema-refutations.test.ts` imports `obligationsOf` from `@systemfsoftware/effect-schema-law/refutation` and `AST` from `effect/SchemaAST`, and asserts that every constraint reachable from an exported schema is refuted by some `refutes` call — so a refinement nobody refuses fails the suite by name.

## Entry points

- `@systemfsoftware/effect-schema-refutation-vite`

## API

The public surface is generated from the source and versioned with the package: [`etc/effect-schema-refutation-vite.api.md`](./etc/effect-schema-refutation-vite.api.md).

Options: `InlineRefutationCoverageOptions` — `dir` (default `"src"`).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/core/effect/schema/refutation-vite#readme).
