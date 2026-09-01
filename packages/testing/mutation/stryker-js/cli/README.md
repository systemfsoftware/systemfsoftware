[![NPM Version][npm-badge]][npm-url]
[![Build Status][ci-badge]][ci-url]
[![License: Apache 2.0][license-badge]][license-url]

# stryker

The `stryker` command for the [System F Software][repo] mutation engine —
output meant to be read by a program.

Every run writes one NDJSON event per line to stdout and exits with a code that
says _which_ thing went wrong, so CI steps and coding agents can act on a run
without scraping a progress bar.

## Getting started

```sh
npm install --save-dev @systemfsoftware/stryker-js-cli
npx stryker run
```

With a `stryker.config.json`:

```json
{
  "testRunner": "command",
  "mutate": ["src/**/*.js"],
  "thresholds": { "high": 100, "low": 80, "break": 0 }
}
```

Requires Node.js 20 or later.

## Usage

```sh
$ npx stryker <command> [options]
```

Mutation testing concepts, the supported mutators, and every `run` option are
the ones [stryker-mutator.io][docs] documents. `stryker --llms`
prints the whole command surface as one JSON object, walked from the command
descriptors rather than hand-maintained.

## Machine output

```console
$ stryker run
{"kind":"stream","schemaVersion":"1.0","runId":"06FY3DSBM7TYC2RZQ0F3EGVZ88","mode":"machine","signal":"tty"}
{"kind":"phase","phase":"instrument","elapsedMs":102}
{"kind":"phase","phase":"dry-run","elapsedMs":6658}
{"kind":"plan","total":2}
{"kind":"verdict","schemaVersion":"1.0","score":100,"thresholds":{"high":100,"low":80,"break":0},"counts":{"killed":2,"survived":0,"timeout":0,"noCoverage":0},"reportFile":"reports/mutation/mutation.json"}
```

| `kind`    | Emitted                 | Carries                                       |
| --------- | ----------------------- | --------------------------------------------- |
| `stream`  | First line of every run | `runId`, `mode`, `signal`                     |
| `phase`   | A stage begins          | `phase`, `elapsedMs`                          |
| `plan`    | Mutants scheduled       | `total`                                       |
| `tick`    | Progress heartbeat      | `elapsedMs`, `completed`, `total`             |
| `verdict` | Run finished            | `score`, `thresholds`, `counts`, `reportFile` |
| `error`   | Run failed              | the failure and a `remediation`               |

The stream drains before the process exits, including on `SIGINT`, so the
terminal line is never truncated.

Machine mode is automatic when stdout is not a TTY. `STRYKER_MODE=machine` sets
it from the environment, and a non-empty `AGENT`, `CLAUDECODE`, or
`CODEX_SANDBOX` selects it even on a TTY. `NO_COLOR` drops colour from the
human path.

## Exit codes

The highest pending class wins; a terminating signal outranks all of them.

| Code      | Meaning                                      |
| --------- | -------------------------------------------- |
| `0`       | Score cleared the `break` threshold          |
| `1`       | Verdict failed                               |
| `2`       | Config error                                 |
| `3`       | Runtime error                                |
| `4`       | Internal error                               |
| `128 + n` | Terminated by signal `n` — `SIGINT` is `130` |

## Related

The mutation engine is [`@systemfsoftware/stryker-js-engine`][engine].
This package is the terminal-facing half and reaches it through an injected
run-event sink;
it ships a command and exposes no importable API.

## License

Licensed under [Apache 2.0][license-url].

[npm-badge]: https://img.shields.io/npm/v/@systemfsoftware/stryker-js-cli?style=flat-square
[npm-url]: https://www.npmjs.com/package/@systemfsoftware/stryker-js-cli
[ci-badge]: https://img.shields.io/github/actions/workflow/status/systemfsoftware/systemfsoftware/release.yml?branch=main&style=flat-square&label=CI
[ci-url]: https://github.com/systemfsoftware/systemfsoftware/actions
[license-badge]: https://img.shields.io/badge/license-Apache_2.0-blue?style=flat-square
[license-url]: https://github.com/systemfsoftware/systemfsoftware/blob/main/LICENSE
[repo]: https://github.com/systemfsoftware/systemfsoftware
[engine]: https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/testing/mutation/stryker-js/engine
[docs]: https://stryker-mutator.io/docs/stryker-js/configuration/
