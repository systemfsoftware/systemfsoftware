# @systemfsoftware/stryker-js

The mutation-testing language — the plugin kinds, capability ports, and schemas
a mutation run is built from, with no platform. The Node host that runs a
mutation test lives in `@systemfsoftware/stryker-js-engine`.

## Install

```sh
pnpm add @systemfsoftware/stryker-js
```

## Entry point

One specifier carries the whole vocabulary. The package entry
enumerates every published symbol exactly once — concepts (Checker,
Evaluator, ExitClass, Ignorer, Metrics, Module, Mutant, Plugin, Report,
ReporterEvent, Run, Schema, TestRunner) are all imported from the root:

```ts
import { Mutant, ReporterEventSchema, StrykerOptionsSchema } from '@systemfsoftware/stryker-js'
```

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/stryker-js/stryker-js#readme).
