# @systemfsoftware/all

The whole stack in one install, plus the oxlint preset that turns every recommended rule on.

Installing this package installs every published `@systemfsoftware/*` package — the Effect runtime libraries, the schema and cell types, the Gherkin spec runners, the Stryker fork and its plugins, and every custom lint plugin — at versions that are known to work together. Its own export is one thing: a ready-made oxlint configuration.

## Install

```sh
pnpm add -D @systemfsoftware/all effect oxlint oxlint-tsgolint typescript
```

`effect`, `oxlint`, `oxlint-tsgolint` and `typescript` are peer dependencies, so your project keeps one copy of each. `oxlint-tsgolint` is the engine oxlint delegates type-aware rules to: without it the first lint run stops at `Failed to find tsgolint executable`. Everything else the stack needs is pulled in for you.

Some packages serve one framework and declare their own optional peers — `react`, `react-dom` and `scheduler` for the React bindings, `vitest` and `@effect/vitest` for the test-time libraries, `vite`, `storybook`, `rxjs`, `@stryker-mutator/api`, `@effect/platform-node` and `@oh-my-pi/pi-coding-agent`. They are optional: install one only when you use the part that needs it, and nothing warns about the ones you skip.

## Turn every rule on

```ts
// oxlint.config.ts
import all from '@systemfsoftware/all'

export default all
```

That single import delivers:

- the built-in `correctness` category at `error`, with the `oxc`, `typescript`, `import`, `unicorn`, `vitest`, `jsdoc`, `node` and `promise` namespaces registered
- the universal defect tier and the test-file hygiene tier
- every custom rule this architecture recommends: the workflow, schema, test-placement, property-testing, hygiene, entrypoint and cell-vocabulary tiers, each at `error`

Type-aware rules are enabled, so the files you lint must be covered by a `tsconfig.json`. Without one, roughly half of these rules produce no diagnostics and say nothing about being inert.

Named exports are available for partial adoption — `rules`, `plugins` and `ignorePatterns` — if you would rather compose than extend.

## Using one package instead

Every package in the stack is published on its own and installs independently. Reach for this one when you want the set; reach for the individual package when you want one library and its own peers.

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware).
