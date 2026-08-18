# @systemfsoftware/stryker-js-vitest-runner

Vitest test-runner plugin for Stryker

## Install

```sh
pnpm add @systemfsoftware/stryker-js-vitest-runner 'vitest@>=2.0.0'
```

Those are peer dependencies: this package declares them but does not install them, so one copy is shared with the rest of your project.

## Entry points

- `@systemfsoftware/stryker-js-vitest-runner`
- `@systemfsoftware/stryker-js-vitest-runner/stryker-setup`

## Use

Name the plugin in your Stryker configuration:

```json
{
  "plugins": ["@systemfsoftware/stryker-js-vitest-runner"]
}
```

## API

The public surface is generated from the source and versioned with the package: [`etc/stryker-js-vitest-runner.api.md`](./etc/stryker-js-vitest-runner.api.md).

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/stryker-js/vitest-runner#readme).
