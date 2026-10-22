# @systemfsoftware/effect-e2e

Effect-native end-to-end testing for TypeScript suites. A suite is a directory with an
`e2e.config.ts`; the `effect-e2e` CLI scaffolds it, runs it in-process, writes a
`report-1` document under `.e2e/`, and exits with a fixed code a pipeline can gate on.

## Scaffold a suite

```bash
pnpm exec effect-e2e init --dir <suite> --engine web --gateway openrouter --no-install
```

`init` writes `e2e.config.ts` (the suite's only environment reader), `vitest.config.ts`
(selecting the same `.e2e.ts` glob and this package's runner), a `package.json` with a
`test:e2e` script, a `.gitignore` entry for `.e2e/`, and two example tests:
`tests/example.e2e.ts` (deterministic, zero model calls) and
`tests/example-agent.e2e.ts` (skips with a reason naming the gateway's API-key variable
when it is unset). A second `init` against an existing suite exits `2` without
`--force`.

## Run it

```bash
pnpm exec effect-e2e run --dir <suite>
```

The runner decodes `e2e.config.ts` once per process — an unknown key or an invalid
value fails `CONFIG_INVALID` naming the key path — selects test files from the
config's `tests` globs (default `['tests/**/*.e2e.ts']`), executes them in-process in
a single worker, and writes `.e2e/report.json`, which decodes against the published
`report-1` schema.

## Exit codes

| Exit | Meaning                                                          |
| ---: | ---------------------------------------------------------------- |
|    0 | Every selected test passed, or was skipped for a declared reason |
|    1 | At least one test failed                                         |
|    2 | Configuration, collection, or policy error                       |
|    3 | Engine, app process, model provider, or artifact failure         |
|    4 | Internal runner error                                            |
|  130 | Interrupted                                                      |

## Attribution

This framework is a rebuild of [TesterArmy](https://github.com/tester-army/e2e)'s
`e2e` (npm `e2e` 0.21.2, upstream commit
[`72abddd`](https://github.com/tester-army/e2e/commit/72abdddd961e2e3a7d24c973eeb2783bea43ee47)),
keeping its user contract — suite scaffolding, `.e2e.ts` test files, the fixed exit
codes — on an Effect-native core. No upstream source is copied. Both projects are
Apache-2.0.
