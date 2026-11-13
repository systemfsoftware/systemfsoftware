# Contributing

## Setup

Install [Deno](https://deno.land/) 2.x, then:

```bash
git clone https://github.com/systemfsoftware/worktrunk-scripts.git
cd worktrunk-scripts
deno task prepare   # installs the husky git hooks
```

## Check

Format and check before you commit:

```bash
deno task fmt       # dprint fmt
deno task check     # dprint check, deno lint, deno check on scripts/
```

`deno task check` is the gate. It must exit 0 on your change.

`deno task test` runs `deno test`, but there are no test modules yet, so it fails with `No test modules found`. Do not read a passing `check` as test coverage.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/). `deno task commitlint` runs commitlint on a message file.

## Layout

- `scripts/` holds the hook entrypoints. Each is a standalone CLI with no exports, and declares its Deno permissions in a shebang. Do not use `-A`.
- `scripts/lib/` holds the shared code: git resolution, path mapping and filesystem helpers.
- `repos/` holds vendored third-party trees from `subtrees.toml`. Do not edit them.
- `docs/` holds solutions and plans.

Hook scripts run from worktrunk's lifecycle, so a change to one changes every new worktree. Test a change by creating a worktree with the hook wired in.
