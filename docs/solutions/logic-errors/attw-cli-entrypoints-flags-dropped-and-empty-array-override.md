---
title: "attw-cli entrypoints flags silently dropped and empty-array overrode discovery"
date: 2026-08-10
category: docs/solutions/logic-errors
module: arethetypeswrong-cli
problem_type: logic_error
component: tooling
symptoms:
  - "attw --entrypoints . produced the same entrypoint count as the unrestricted run (11, not 1)"
  - "every flagless attw run on a real package printed 'No entrypoints found.' and exited 0"
  - "the contract lane never caught either bug because it was blocked on the Docker socket and never ran"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [attw, effect-cli, options-repeated, entrypoints, check-package]
---

# attw-cli entrypoints flags silently dropped and empty-array overrode discovery

## Problem

The Effect-TS rewrite of the `attw` CLI silently dropped every `--entrypoints` /
`--include-entrypoints` / `--exclude-entrypoints` flag, and — worse — every run
that omitted those flags reported zero entrypoints and exited 0 (success),
masking all real analysis problems. The contract lane that should have caught
this had never executed (it was blocked on an unreachable Docker socket), so
both bugs shipped hidden behind a green-but-unrun gate.

## Symptoms

- `attw vue@3.3.4.tgz --entrypoints . -f json` returned the full entrypoint set
  (11 keys) instead of the restricted `.` entrypoint.
- `attw axios@1.4.0.tgz` (no flags) printed `No entrypoints found.` and exited 0,
  even though axios has well-known resolution problems that should exit nonzero.
- The output was nondeterministic-looking across contract runs only because the
  gherkin framework stops after the first failing scenario; the underlying
  behaviour was fully deterministic once the lane actually ran.

## What Didn't Work

- Chasing the symptom as flakiness. The contract lane showed a _different_
  scenario failing each run, which looked like a container-exec race. It was not:
  `effect-gherkin-spec` short-circuits remaining scenarios after the first
  failure, so whichever scenario landed first reported the failure and the rest
  showed as `·` (not-run). The "flakiness" was the failure jumping to whichever
  scenario ran first.
- Suspecting the `WorkingDir`. testcontainers/podman exec with a missing working
  directory does return empty stdout (`crun: chdir ... No such file or directory`,
  exit 127), and that masked the real fault early on — but after fixing the
  fixture paths to absolute, the empty-output / exit-0 symptom persisted, which
  ruled out the working directory as the root cause.

## Solution

Two fixes, one per bug.

**Bug 1 — the service dropped the options.** `CheckPackageService.execute`
(`packages/arethetypeswrong/core/src/check-package.executor.ts`) took
`(pkgSpec, definitelyTyped?)` and called `checkPackage(pkg)` with no options,
discarding the `CheckPackageOptions` the core's `checkPackage` accepts. The
second parameter was already unused (`_definitelyTyped`), so it was repurposed
to carry the options through:

```ts
// core/src/check-package.executor.ts
readonly execute: (
  pkgSpec: string,
  options?: CheckPackageOptions,   // was: definitelyTyped?: string | boolean
) => Effect.Effect<CheckResult, Error, PackageStoreAdapter>

// in CheckPackageLive:
try: () => checkPackage(createPackageFromTarballData(bytes), options),  // was: no second arg
```

**Bug 2 — the empty array overrode discovery.** The handler defines each flag as
`Options.optional(Options.repeated(Options.text('entrypoints'))`)
(`attw.handler.ts`). When the flag is absent, `Options.optional` of a `repeated`
option yields `Some([])` — **not** `None` — because `repeated` always succeeds
with an empty array. `unwrap` (`isSome(opt) ? opt.value : undefined`) then
returns `[]`, which is truthy. The executor forwarded it:

```ts
// attw.executor.ts — the bug
entrypoints: request.entrypoints ? [...request.entrypoints] : undefined,
//             ^^^^^^^^^^^^^^^^^^^ [] is truthy → forwards [] → not undefined
```

The core's `getEntrypoints` (`packages/arethetypeswrong/core/src/internal/getEntrypointInfo.ts`) treats a present
`entrypoints` array as exhaustive and overrides auto-discovery:

```ts
if (options?.entrypoints) {                           // [] is truthy → enters
  return options.entrypoints.map((e) => ...);         // [].map → [] → zero entrypoints
}
```

So every flagless run forwarded `entrypoints: []`, discovery returned nothing,
and the analysis reported no entrypoints and no problems (exit 0). The fix
checks for a **non-empty** array, not truthiness:

```ts
// attw.executor.ts — the fix
entrypoints: request.entrypoints?.length ? [...request.entrypoints] : undefined,
includeEntrypoints: request.includeEntrypoints?.length ? [...request.includeEntrypoints] : undefined,
excludeEntrypoints: request.excludeEntrypoints?.length ? [...request.excludeEntrypoints] : undefined,
```

## Why This Works

`Options.optional(Options.repeated(...))` models "the user did not pass the
flag" as `Some([])`, not `None`, because the inner `repeated` option always
parses to a (possibly empty) array and `optional` only wraps whether the
underlying option was _invoked_. This is the correct encoding for a
zero-or-more flag, but it inverts the usual Option discipline: an absent flag is
a _present_ value, not an absent one. Any downstream "was this set?" check must
test `.length`, never truthiness — `[]` is truthy. The two bugs compounded: the
service dropped the options entirely (so even a correctly-set flag did nothing),
and once that was fixed, the empty-array forwarding made the _absence_ of a flag
act like an explicit "check nothing."

## Prevention

- **Test the observable flag effect, not just that it parses.** The contract
  lane's `--entrypoints .` scenario (`restrict to root entrypoint → fewer
  entrypoints`) is what caught bug 1 once the lane finally ran. A flag whose
  parsed value never reaches the analysis is invisible to unit tests that stop
  at the handler.
- **Treat `Options.optional(Options.repeated(...))` absence as `Some([])`.**
  When forwarding a repeated-option value into a downstream API that treats an
  array as exhaustive, gate on `.length`, not truthiness. This applies to
  `--entrypoints`, `--include-entrypoints`, `--exclude-entrypoints`, and
  `--ignore-rules` in this CLI — anywhere an empty array would override a
  default rather than append to it.
- **A green-but-unrun gate is non-evidence.** The contract lane was the only
  test that exercises the full handler → executor → core path, and it had never
  run. Both bugs lived in that unexercised path. A gate that cannot run cannot
  certify anything; record the blocker, do not treat the absence of failure as
  success.

## Related Issues

- Contract lane stopped at a dead Docker socket — `docs/solutions/test-failures/contract-lane-stops-at-dead-docker-socket.md`
- arethetypeswrong-core requires the `typescript` API — `docs/solutions/tooling-decisions/arethetypeswrong-core-requires-js-typescript-api.md`
