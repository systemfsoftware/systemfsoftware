---
title: Match dispatch in a registration path buries the user's call site
date: 2026-10-02
category: runtime-errors
module: "@systemfsoftware/vitest"
problem_type: runtime_error
component: testing_framework
symptoms:
  - "SelfModelLaw (or any property failure) reports `site: null` after a refactor that changed no logic"
  - "The site comes back when Error.stackTraceLimit is raised, e.g. to 200"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
tags: [call-site, stack-trace-limit, effect-match, const-p2, property-engine]
---

# Match dispatch in a registration path buries the user's call site

## Problem

`callFrame` reads `new Error().stack` and returns the first user frame. V8 keeps only `Error.stackTraceLimit` frames, 10 by default. During #576, the ternary in the law surface's `model` registration (`makeProperty`) was rewritten as `Match.value(...).pipe(Match.when(...), Match.orElse(...))`. That added several `effect/Match` frames between the test file and `callFrame`. The test file's frame fell past the limit and `SelfModelLaw.site` became `null`, which breaks the #576 requirement that every property failure carries its call site.

## Failure Mechanism

1. A user frame stays visible only while `d_user < L`. Here $d_{user}$ counts the frames between the `new Error()` inside `callFrame` and the test file's frame, and $L$ = `Error.stackTraceLimit`.
2. Every combinator a registration path calls before it reaches `callFrame` (here `body` or `refuseSelfModel`) adds frames to $d_{user}$. The library-frame filter `isSiteOf` can skip only frames the truncated stack still holds.
3. Once $d_{user} \geq L$ the stack holds no user frame, so `callFrame` returns `undefined` and the failure's `site` is `null`. Nothing throws and the logic is unchanged.

## Architectural Invariants

- **Shallow registration.** Code that runs between a user's API call and call-site capture stays within a fixed, small frame depth. Capture the site first (`const site = callFrame()`) and pass it down, or dispatch directly.
- **Delete the flag, not the branch.** When a registration helper branches on a boolean, remove the boolean: split the helper per case. The law surface's `gated(…, exempt)` became `judged` and `exempted`, so no dispatch remains.
- **Combinator dispatch belongs to pure decisions.** CONST-P2 rewrites (`Match`, `Option`) are safe in decisions that capture no stack, such as `verdictKindOf` and `resolveSeed`.

```ts
// wrong: combinator frames sit between the user call and callFrame()
const model = (name, spec, oracle) =>
  Match.value(isSelfModel(spec.subject, oracle)).pipe(
    Match.when(true, () => refuseSelfModel(name)), // callFrame() runs deep inside Match
    Match.orElse(() => judged(name, spec, modelHolds(oracle))),
  )

// right: direct dispatch keeps the user frame inside the limit
const model = (name, spec, oracle) =>
  isSelfModel(spec.subject, oracle) ? refuseSelfModel(name) : judged(name, spec, modelHolds(oracle))
```

## Why This Works

The site depends on stack depth, not on logic, so the refactor passes every check that does not read `site`. With a direct dispatch, $d_{user}$ stays at the depth `callFrame` was written for. With the flag split, no branch is left for CONST-P2 to object to.

## Prevention

- Assert that the failure's `site` names the test file. The `SelfModelLaw` behavioral test in the vitest package's failure-fields suite does this. Raising `Error.stackTraceLimit` inside such a test hides the defect, so never do it.
- Code-smell grep in registration code: `Match.value(` or `.pipe(` inside a function that calls `runtime.register` or `callFrame`.

## Related Issues

- GitHub issue #576 (pending PR)
