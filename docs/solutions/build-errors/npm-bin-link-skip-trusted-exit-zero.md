---
title: npm install silently skips a bin whose tarball target is missing, and the suite trusted exit 0
date: 2026-08-19
category: build-errors
module: arethetypeswrong-cli
problem_type: test_failure
component: tooling
symptoms:
  - "test:contract fails with `exec: \"/work/node_modules/.bin/attw\": stat /work/node_modules/.bin/attw: no such file or directory` on every real scenario"
  - "three scenarios still pass: they assert `exitCode >= 0` and non-empty stdout, which the OCI exec error text satisfies"
  - "the container `npm install` of the packed tarballs exits 0 with no warning at `--loglevel=error`, so the suite's only check (`exitCode !== 0`) never fires"
root_cause: incomplete_setup
resolution_type: test_fix
severity: high
tags: [npm, bin-linking, tarball, testcontainers, ci-false-green, attw]
---

# npm install silently skips a bin whose tarball target is missing, and the container suite trusted exit 0

## Problem

The `arethetypeswrong-cli` container contract lane failed because `/work/node_modules/.bin/attw` never existed inside the container, yet the suite's install check could not see the failure: `npm install` exits 0 even when it silently skips creating a bin whose target file is missing from the installed package. The suite then failed eight scenarios deep with opaque OCI `exec` errors, and three scenarios passed vacuously.

## Symptoms

- `exec: "/work/node_modules/.bin/attw": stat /work/node_modules/.bin/attw: no such file or directory` (OCI runtime exec failure) across the real scenarios.
- `Given('the attw binary is installed in the container')` returns empty stdout instead of `ok`.
- The format scenarios (`table`, `table-flipped`, `ascii`) assert `exitCode >= 0` and `stdout.length > 0` — the error text itself satisfies both, so the suite ran green for its binary, red only for the binaries.
- npm's own trust: exit code 0 after install with no `.bin/attw` (reproduced in `node:22-alpine`, `npm 10`).

## What Didn't Work

- Checking only `installed.exitCode !== 0` after the container `npm install` — npm does not fail when it skips a bin link; it completes with a warning class npm treats as non-fatal (hidden entirely at `--loglevel=error`).
- Relying on `pnpm pack` always shipping the build output (it does — `prepack: pnpm build` reruns the build and the tarball carries the built CLI) — the failure was not the pack; it was that the lane never verified the runtime artifact after installing.

## Solution

In `packages/arethetypeswrong/cli/tests/__fixtures__/GlobalSetup.ts`, after the container install, explicitly re-link the bin and assert it:

```ts
const relink = await attwContainer.exec(
  ['npm', 'rebuild', '@systemfsoftware/arethetypeswrong-cli', '--no-audit', '--no-fund', '--loglevel=error'],
  { workingDir: WORKDIR },
)
if (relink.exitCode !== 0) { throw new Error(...) }

const binOk = await attwContainer.exec(['sh', '-c', 'test -x node_modules/.bin/attw && echo ok'], { workingDir: WORKDIR })
if (binOk.exitCode !== 0 || binOk.stdout.trim() !== 'ok') { throw new Error(...) }
```

`npm rebuild <pkg>` re-creates the missing bin link (verified in-container: install → remove `.bin/attw` → `npm rebuild` → link restored and `attw --help` runs). The guard failure names the real cause — "the packed tarball lost its build output or its bin field" — instead of 8 cryptic OCI errors.

## Why This Works

- npm's install-time bin linking skips a bin when the target file is missing and reports it only as a warning; exit code stays 0. A green install class never implied a runnable binary.
- `npm rebuild` runs the bin-linking pass again for the named package; with `dist` present the link is (re)created. `prepare`/`prepack` on the host side already ensured the tarball carries `dist`.
- The subsequent `test -x` assertion enforces the suite's own precondition at the setup boundary, so a missing binary becomes a named setup error before any scenario runs.

## Prevention

- In container/ff test lanes, never treat `npm install` exit 0 as proof the installed binary exists. Assert the artifact the scenarios will exec; if the install pipeline can skip link creation, add an explicit relink step.
- Keep the pack-then-install flow honest: the guard message names the tarball's build output or `bin` field as the failure point so a future pack regression reports where to look.
- Watch for vacuous scenario assertions: `exitCode >= 0` plus non-empty stdout passes an OCI exec failure text. Assert on the actual contract (exit of the binary, structurally parsed stdout), not generic non-emptiness.

## Related Issues

- [pnpm skips a `.bin` shim whose target is gitignored build output, and never retries](./pnpm-bin-shim-skipped-for-gitignored-build-target.md) — same failure family in the host side: install-time bin linking that skips missing targets, silent until a gate reads it as green. pnpm skips link the _first_ pass and links the second (`prepare` builds in between); npm skips the link at tarball install and only a fresh `rebuild` re-links.
