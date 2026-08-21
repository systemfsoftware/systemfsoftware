[![NPM Version][npm-badge]][npm-url]
[![License: Apache 2.0][license-badge]][license-url]

# @systemfsoftware/stryker-js-mutation-report

The reporter adapters of the [System F Software][repo] StrykerJS fork —
clear-text, progress, HTML, JSON, and NDJSON-stream presentation.

This package is consumed by the fork's CLI ([`@systemfsoftware/stryker-js-cli`][cli])
and engine ([`@systemfsoftware/stryker-js-mutation-run`][engine]); it exposes
no public API of its own beyond the reporter classes and the `strykerPlugins`
registry the CLI resolves when it boots a run.

## Usage

You normally never import this package directly — the CLI wires it in. The
pieces exist so a programmatic consumer can assemble its own host:

```ts
import { ClearTextReporter, strykerPlugins } from '@systemfsoftware/stryker-js-mutation-report'
```

## Related

- [`@systemfsoftware/stryker-js-mutation-run`][engine] — the engine that emits the events these reporters present
- [`@systemfsoftware/stryker-js-cli`][cli] — the terminal-facing half, which binds this package's `strykerPlugins`

## License

Licensed under [Apache 2.0][license-url].

[npm-badge]: https://img.shields.io/npm/v/@systemfsoftware/stryker-js-mutation-report?style=flat-square
[npm-url]: https://www.npmjs.com/package/@systemfsoftware/stryker-js-mutation-report
[license-badge]: https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square
[license-url]: https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE
[repo]: https://github.com/systemfsoftware/systemfsoftware
[engine]: https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/stryker-js/mutation-run
[cli]: https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/stryker-js/cli
