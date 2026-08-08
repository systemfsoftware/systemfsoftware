# @systemfsoftware/stryker-js-cli

The `stryker` command-line interface for the System F Software Stryker fork.

This package owns everything the terminal sees: the NDJSON run-event stream on
stdout, colour and progress mode detection, signal handling, drain-before-exit,
and the process exit code. The mutation engine itself lives in
`@systemfsoftware/stryker-js-core`, which this package reaches through an
injected run-event sink.

This package ships the `stryker` binary (declared in `package.json` as
`bin/stryker.js`) and the `runStrykerCli` entry point exported from
`src/mod.ts` and re-exported from `dist/index.mjs`. The binary runs the CLI
through the Effect runtime and resolves the run's outcome into the process
exit code.

```bash
pnpm add -D @systemfsoftware/stryker-js-cli
npx stryker run
```
