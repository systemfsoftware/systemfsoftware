---
title: "A type import from a devDependency inlines that package's declarations into the published d.ts"
date: 2026-09-27
category: build-errors
module: differential-spec
problem_type: build_error
component: tooling
symptoms:
  - "every build rewrites package.json with an inlinedDependencies field naming vitest and tinybench"
  - "the bundled index.d.ts grows by thousands of lines of vitest and tinybench declarations"
  - "pnpm check:local stays green; the only trace is a dirty package.json after the build"
root_cause: config_error
resolution_type: code_fix
severity: medium
tags: [tsdown, dts-bundling, inlined-dependencies, vitest, published-types]
---

# A type import from a devDependency inlines that package's declarations into the published d.ts

## Problem

During #556, the `@systemfsoftware/differential-spec` supervisor module (the one declaring `DualExecutionSupervisorOptions`) gained `import type * as V from 'vitest'` and exported `checkOptions` and `announceHostBound`, whose signatures named `V.TestOptions` and `V.TestContext`. `vitest` is not in the package's `dependencies` or `peerDependencies` (they list only `@systemfsoftware/effect-sim-kernel`, `@systemfsoftware/vitest`, `effect` and `fast-check`). tsdown's declaration bundler therefore could not leave the type as an external import. It copied vitest's declarations, and tinybench's declarations along with them, into the bundled declaration file, then recorded both packages under `inlinedDependencies` in `package.json`.

## Symptoms

- After `pnpm --filter @systemfsoftware/differential-spec build`, `git status` shows `package.json` modified with `"inlinedDependencies": { "tinybench": "6.1.4", "vitest": "5.0.1" }`.
- The bundled `index.d.ts` contains a `#region` block copied from tinybench's declarations and vitest's `interface TestContext`.
- Typecheck, lint, tests and `pnpm check:local` all pass. Nothing fails; the published types are simply wrong.

## What Didn't Work

- Restoring `package.json` from git. The next build writes the field again, because the build derives it from what it inlined (see `turbo-boundary-audit-catches-undeclared-deps.md`: never hand-edit `inlinedDependencies`).
- Committing the field. That ships a copy of a test runner's types inside a published library, and those types drift away from whatever vitest version the consumer installs.

## Solution

Replace the devDependency's types in the published module with structural types that describe only the members the code uses:

```ts
type CheckOptions = { readonly timeout: number }
type AnnotatedContext<Annotation> = { readonly annotate: (message: string) => Promise<Annotation> } | null
type Announcement = <Annotation>(ctx: AnnotatedContext<Annotation>) => Effect.Effect<void>

export const checkOptions = (options?: DualExecutionSupervisorOptions): CheckOptions => ...
export const announceHostBound = (options?: DualExecutionSupervisorOptions): Announcement => ...
```

vitest's own `TestOptions` and `TestContext` are still assignable to these types where the `Differential` and `Metamorphic` builders register their checks. After the change the build leaves `package.json` untouched and the bundled `index.d.ts` is 90 lines.

## Why This Works

A declaration bundler keeps a type as an `import` only when the referenced package will be installed next to the consumer, which means it is a dependency or a peer. For a devDependency it has two choices: inline the declarations or emit a dangling import. tsdown inlines them and records what it inlined. Once the published module names no type from the devDependency, the bundler has nothing to inline.

## Prevention

- After building a publishable package, check `git status -- <pkg>/package.json`. If a build rewrote `inlinedDependencies`, look for a type from a package missing from `dependencies` and `peerDependencies`.
- In published source, name a devDependency's types only in test files. If a runtime module has to accept a test-runner object, describe it with a structural type or declare the runner as a peer.

## Related Issues

- `docs/solutions/tooling-decisions/turbo-boundary-audit-catches-undeclared-deps.md`: the build owns `inlinedDependencies`, and a stale entry disappears on rebuild.
- #556, the change that introduced and fixed the inlining.
