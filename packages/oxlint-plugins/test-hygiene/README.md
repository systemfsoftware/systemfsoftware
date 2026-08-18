# @systemfsoftware/oxlint-plugin-test-hygiene

Oxlint rules for test hygiene: DAMP test naming and property-based test naming conventions.

## Install

```sh
pnpm add @systemfsoftware/oxlint-plugin-test-hygiene 'effect@4.0.0-rc.108' 'typescript@>=5.0.0'
```

Those are peer dependencies: this package declares them but does not install them, so one copy is shared with the rest of your project.

## Entry points

- `@systemfsoftware/oxlint-plugin-test-hygiene`

## Use

Register the plugin and enable what it recommends:

```ts
// oxlint.config.ts
import plugin from '@systemfsoftware/oxlint-plugin-test-hygiene'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: [import.meta.resolve('@systemfsoftware/oxlint-plugin-test-hygiene')],
  rules: { ...plugin.configs.recommended.rules },
})
```

A rule configured without its plugin registered is reported as unknown and never runs, so both halves are required.

## API

The public surface is generated from the source and versioned with the package: [`etc/oxlint-plugin-test-hygiene.api.md`](./etc/oxlint-plugin-test-hygiene.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/oxlint-plugins/test-hygiene#readme).
