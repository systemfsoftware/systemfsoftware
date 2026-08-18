# @systemfsoftware/effect-purity-law

Property-test the determinism law of any function claimed to be pure — one call registers ∀x. f(x) = f(x) with @effect/vitest and fast-check, catching ambient impurity a lint rule cannot follow across a module boundary.

## Install

```sh
pnpm add @systemfsoftware/effect-purity-law '@effect/vitest@catalog:' 'effect@4.0.0-rc.108' 'vitest@*'
```

Those are peer dependencies: this package declares them but does not install them, so one copy is shared with the rest of your project.

## Entry points

- `@systemfsoftware/effect-purity-law`

## API

The public surface is generated from the source and versioned with the package: [`etc/effect-purity-law.api.md`](./etc/effect-purity-law.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/effect-purity-law#readme).
