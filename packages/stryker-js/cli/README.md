# @systemfsoftware/stryker-js-cli

The `stryker` command-line interface for the System F Software Stryker fork.

This package owns everything the terminal sees: the NDJSON run-event stream on
stdout, colour and progress mode detection, signal handling, drain-before-exit,
and the process exit code. The mutation engine itself lives in
`@systemfsoftware/stryker-js-core`, which this package reaches through an
injected run-event sink.

```bash
pnpm add -D @systemfsoftware/stryker-js-cli
npx stryker run
```

> [!NOTE]
> The CLI entry point moves into this package from core in the extraction that
> follows the initial skeleton; until then the package ships an empty barrel.
