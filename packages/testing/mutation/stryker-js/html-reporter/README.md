[![NPM Version][npm-badge]][npm-url]
[![License: Apache 2.0][license-badge]][license-url]

# @systemfsoftware/stryker-js-html-reporter

HTML reporter plugin for the @systemfsoftware mutation engine.

## Usage

You normally never import this package directly — the CLI wires it in. The
reporter exists so a programmatic consumer can assemble its own host:

```ts
import { makeHtmlReporter, strykerPlugins } from '@systemfsoftware/stryker-js-html-reporter'
```

## Related

- [`@systemfsoftware/stryker-js-platform-node`][engine] — the engine that emits the events this reporter presents
- [`@systemfsoftware/stryker-js-cli`][cli] — the terminal-facing half, which binds this package's `strykerPlugins`

## License

Licensed under [Apache 2.0][license-url].

[npm-badge]: https://img.shields.io/npm/v/@systemfsoftware/stryker-js-html-reporter?style=flat-square
[npm-url]: https://www.npmjs.com/package/@systemfsoftware/stryker-js-html-reporter
[license-badge]: https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square
[license-url]: https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE
[repo]: https://github.com/systemfsoftware/systemfsoftware
[engine]: https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/testing/mutation/stryker-js/platform-node
[cli]: https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/testing/mutation/stryker-js/cli
