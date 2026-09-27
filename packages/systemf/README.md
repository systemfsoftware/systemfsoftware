# @systemfsoftware/systemf

`systemf` fails a package that ships a unit no stop check reaches.

A **unit** is what its type says it is: a module of the package's `src` that declares a `Cell`, a
`Blueprint`, a `Handle`, or a `Supervisor.Medium` port — alone, in a union or intersection, under an
alias, or as a `Context.Service` type argument. A module that declares the brand or the kind
machinery is a kind, never a unit. Nothing is opted into: no marker, no filename suffix, no
allowlist.

A unit is **linked** when a `Conformance.stopped` call in one of the package's conformance test
files reaches it — directly, or through a value reference inside another reached declaration of the
same package. A type-only import never links.

The kinds are resolved by package and export name through the checker
(`@systemfsoftware/effect-cell-types` publishes `Cell`, `Blueprint`, and `Handle`;
`@systemfsoftware/effect-daemon-spec` publishes `Supervisor.Medium`), never by a `src` path, so the
check works in a consumer repository where those packages resolve to published declaration files.

## Install

```sh
pnpm add -D @systemfsoftware/systemf
```

The package installs one binary, `systemf`.

## The command tree

```text
systemf [--json] [--cwd <dir>]
├── check [<package>...] [--project <tsconfig>] [--only <rule-id>]...
├── unit
│   ├── list [<package>] [--kind <cell|blueprint|handle|medium>] [--uncovered]
│   └── show <module>
└── manifest
```

- `check` is the gate. `<package>` defaults to the working directory; `--project` picks the tsconfig
  the check loads (default: the package's `tsconfig.test.json`, then its `tsconfig.json`); `--only`
  runs one rule and repeats.
- `unit list` is one row per enrolled unit with its kind, declarations, and coverage; `unit show`
  names every stop check that reaches one unit, and the fix when none does.
- `manifest` is the machine-readable contract of everything above.
- `--json` writes one JSON envelope to stdout instead of text; `--cwd` sets the directory package
  arguments resolve against.

One text run of `check`:

```text
✗ stop-coverage  src/SocketMedium/socket-medium.ts  (port, targetOf, mediumOf)
  no Conformance.stopped check reaches this unit
  fix: pass `port` as `unit` to Conformance.stopped in tests/*.conformance.test.ts
  → systemf unit show src/SocketMedium/socket-medium.ts
1 finding · 1 unit · exit 1
```

## The JSON contract

With `--json`, a run writes exactly one document to stdout.

A success envelope carries `apiVersion`, the `type` of the command family, and its `data`:

```json
{
  "apiVersion": 1,
  "type": "check",
  "data": { "packages": [], "findings": [], "summary": { "packages": 0, "units": 0, "findings": 0 } }
}
```

An error envelope carries `apiVersion`, a human `error`, a stable `code`, and the closest known
names as `suggestions` when there are any:

```json
{
  "apiVersion": 1,
  "error": "unknown rule nope",
  "code": "ERR_UNKNOWN_RULE",
  "suggestions": ["stop-coverage", "conformance-lane", "sources-readable"]
}
```

The `type` a success envelope carries, one per command family:

| `type`      | written by  | `data`                                                                         |
| ----------- | ----------- | ------------------------------------------------------------------------------ |
| `check`     | `check`     | `{ packages, findings, summary }`                                              |
| `unit.list` | `unit list` | `{ units }`                                                                    |
| `unit.show` | `unit show` | `{ package, module, kind, declarations, reaches, fix? }`                       |
| `manifest`  | `manifest`  | `{ name, version, description, globalFlags, commands, exitCodes, errorCodes }` |

The `manifest` data names the program (`name`, `description`, its package `version`), lists the
program's `globalFlags` once, and gives every command its own `flags`, `arguments`, `examples`, and
`resultTypes`.

### Error codes

An `ERR_*` literal is never renamed and never removed. A new failure gets a new code; a consumer may
branch on any code in this table forever.

| `code`                   | meaning                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `ERR_UNKNOWN`            | a failure the command cannot name more precisely                  |
| `ERR_UNKNOWN_COMMAND`    | the command or subcommand does not exist                          |
| `ERR_INVALID_OPTION`     | an option is unknown, repeated, or carries a value it rejects     |
| `ERR_INVALID_ARGUMENT`   | a positional argument is unexpected or carries a value it rejects |
| `ERR_MISSING_ARGUMENT`   | a required argument or option was not given                       |
| `ERR_NOT_A_PACKAGE`      | the path is not a package (no readable package.json)              |
| `ERR_TSCONFIG_NOT_FOUND` | the package has no tsconfig the check can load                    |
| `ERR_UNKNOWN_RULE`       | the rule id given to `--only` does not exist                      |
| `ERR_UNKNOWN_UNIT`       | no unit matches the module path or export name                    |
| `ERR_AMBIGUOUS_UNIT`     | more than one unit matches the module path or export name         |

### Rules and findings

`check` runs three rules, in this order:

| rule id            | fails when                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `stop-coverage`    | an enrolled unit is not reached by a `Conformance.stopped` check                             |
| `conformance-lane` | a package with linked units runs a `test` script that never includes `--project conformance` |
| `sources-readable` | a source path the check needed could not be read                                             |

Every finding carries `rule`, `file`, `declarations`, `message`, and the `fix` that clears it.

## Exit codes

| code | meaning                                               |
| ---- | ----------------------------------------------------- |
| 0    | clean: every enrolled unit is reached by a stop check |
| 1    | findings: at least one rule failed                    |
| 2    | usage error, or a check that could not run            |

## Adopt it in another repository

Add the command to every package that owns units:

```jsonc
{
  "scripts": {
    "check:systemf": "systemf check"
  }
}
```

The package needs a `tsconfig.test.json` (or `tsconfig.json`) that includes both its `src` and its
conformance tests, and its `test` script must reach the conformance project — the `conformance-lane`
rule names the package when it does not. Run the command in CI on every pull request; a package that
never runs it is not covered.

An agent asks the binary what it can do instead of reading this file:

```sh
systemf manifest --json   # every command, flag, argument, result type, exit code, and error code
systemf unit show src/SocketMedium/socket-medium.ts   # one unit's stop checks
```

The manifest is generated from the command definitions and their own help documents, so it cannot
drift from the binary.

## API

`check`, `unitList`, and `unitShow` return their data as Effects, for a caller that wants the
counts rather than the exit code; `manifest` is the built-in command tree's manifest as data;
`runSystemf(args)` runs one command line and returns `{ exitCode, stdout }` — the lines the process
would write — so a caller can drive the CLI without a process; `systemf`'s own bin is the only place
that writes to `process.stdout` and sets `process.exitCode`.
`@systemfsoftware/systemf/json` re-exports every envelope schema and `decodeResponse`, which decodes
one `systemf --json` document.
