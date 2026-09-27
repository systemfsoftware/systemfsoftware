# @systemfsoftware/stop-enrollment

`stop-enrollment` fails a package that ships a unit no stop rule reaches.

A **unit** is what its type says it is: a module of the package's `src` that
declares a `Cell`, a `Blueprint`, a `Handle`, or a `Supervisor.Medium` port —
alone, in a union or intersection, under an alias, or as a `Context.Service`
type argument. A module that declares the brand or the kind machinery is a kind,
never a unit. Nothing is opted into: no marker, no filename suffix, no allowlist.

A unit is **linked** when a `Conformance.stopped` call in one of the package's
conformance test files reaches it — directly, or through a value reference
inside another reached declaration of the same package. A type-only import never
links.

The kinds are resolved by package and export name through the checker
(`@systemfsoftware/effect-cell-types` publishes `Cell`, `Blueprint`, and `Handle`;
`@systemfsoftware/effect-daemon-spec` publishes `Supervisor.Medium`), never by a
`src` path, so the check works in a consumer repository where those packages
resolve to published declaration files.

## Usage

```sh
stop-enrollment [--project <tsconfig>] [<packageRoot>]
```

- `<packageRoot>` defaults to the working directory.
- `--project <tsconfig>` defaults to the package's `tsconfig.test.json`, then its
  `tsconfig.json`. The program is built to include both `src` and the tests.

One line per enrolled module no stop rule reaches, then a summary:

```text
src/queue.blueprint.ts: has no stop rule (Queue)
stop enrollment: 12 enrolled module(s), 11 with a stop rule (9 linked directly, 2 reached through declarations)
```

Exit code `1` names every unlinked module, a package whose `test` script never
runs the conformance project, an unreadable `src/`, or a missing tsconfig; `0`
means every enrolled unit is reached.

Run it per package, beside the package's own tests:

```jsonc
{
  "scripts": {
    "check:stops": "stop-enrollment"
  }
}
```

## API

`checkStopEnrollment(options)` returns the report as an Effect, for a caller that
wants the counts rather than the exit code; `runStopEnrollmentCli(args)` returns
the exit code and the lines a command-line run prints.
