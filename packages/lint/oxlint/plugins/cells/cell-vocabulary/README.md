# @systemfsoftware/oxlint-plugin-cell-vocabulary

Oxlint rules that walk Cell.vocabulary to keep Cell composition honest: report I/O reached from a pure phase body, a second Cell.run fed the success of an earlier one, and FileSystem/Path provideService-d onto a Cell.run.

## Install

```sh
pnpm add @systemfsoftware/oxlint-plugin-cell-vocabulary 'effect@4.0.0-rc.108' 'typescript@>=5.0.0'
```

Those are peer dependencies: this package declares them but does not install them, so one copy is shared with the rest of your project.

## Entry points

- `@systemfsoftware/oxlint-plugin-cell-vocabulary`

## Use

Register the plugin and enable what it recommends:

```ts
// oxlint.config.ts
import plugin from '@systemfsoftware/oxlint-plugin-cell-vocabulary'
import { defineConfig } from 'oxlint'

export default defineConfig({
  jsPlugins: [import.meta.resolve('@systemfsoftware/oxlint-plugin-cell-vocabulary')],
  rules: { ...plugin.configs.recommended.rules },
})
```

A rule configured without its plugin registered is reported as unknown and never runs, so both halves are required.

## API

The public surface is generated from the source and versioned with the package: [`etc/oxlint-plugin-cell-vocabulary.api.md`](./etc/oxlint-plugin-cell-vocabulary.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/oxlint-plugins/cell-vocabulary#readme).
