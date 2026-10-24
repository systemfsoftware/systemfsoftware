---
title: "Non-replayable encode-law flake: V8's warm JSON.parse rewrites lone-surrogate keys (SYS-622)"
date: 2026-10-24
category: test-failures
module: effect-e2e
problem_type: test_failure
component: model_gateway
symptoms:
  - "a generated codec law (for example ∀x_ChatCompletionRequest_=x) fails stochastically at CI's 1000-run tier but passes on immediate rerun"
  - "CONFORMANCE_REPLAY of a token captured minutes earlier raises ReplayNoLongerReproduces"
  - "the falsified input's tool_calls arguments contain exotic JSON keys (NUL, lone surrogates, empty string)"
  - "the shrunk counterexample re-evaluates green when reconstructed as a literal"
root_cause: runtime_json_parse_bug
resolution_type: documented_runtime_exposure
severity: high
tags: [effect-ts, schema, property-testing, json, v8, flake, conformance-replay]
---

# Non-replayable encode-law flake: V8's warm JSON.parse rewrites lone-surrogate keys

`∀x_ChatCompletionRequest_=x` failed 2 of 14 CI-tier sweeps on main 88194bdcc (SYS-622). Every
`CONFORMANCE_REPLAY` token — including one captured from a live failure minutes earlier — raised
`ReplayNoLongerReproduces`, and three unseeded reruns passed, so no seed could pin it.

## Mechanism

The law's round trip crosses a JSON-text hop: `tool_calls[].function.arguments` is a
`Schema.fromJsonString(Schema.JsonObject)` field, whose decode is the platform's own
`JSON.parse` (`repos/effect` `SchemaGetter.ts` — `parseJson` calls `JSON.parse(input)`). Effect
4.0.5's `Schema.JsonObject` arbitrary draws arguments objects whose keys include lone surrogates
and control characters; those keys are legal JSON text.

On Node 24.21 / V8 13.6.233.17-node.53, `JSON.parse` is correct cold but, once the process has
parsed enough varied JSON (the law run's own codec traffic; 50k parses of simple objects do not
trigger it), it mis-parses **a key that begins with a `\u` escape when an earlier key in the same
object carries a `\u0000 escape**:`JSON.parse('{"\u0000":"","\udc00":true,"":[]}')`then yields
keys U+0000, U+005C (a lone backslash), "" instead of U+0000, U+DC00, "".`JSON.parse.toString()`still reports`[native code]`; a reviver does not help; the surrogate-first order and surrogate-only
objects parse correctly. The decoded arguments therefore differ from the drawn value, the law's
identity check falsifies, and because the shrinker settles on pairs whose re-evaluation depends on
the same warm state, the recorded token names a case that no longer fails.

Deterministic diagnosis harness (fails in-process every time, on the pre-fix and current code
alike): twin `Arbitrary.checkEffect` over `ChatCompletionRequest` with the law predicate at seed
3487975599 — inside the false verdict, `JSON.stringify(arguments)` is byte-correct while
`JSON.parse` of those exact bytes returns the rewritten key.

## What was done (SYS-622)

- The named wire losses in the issue (assistant `content: null` → `''`; `tool_choice: 'auto'`
  dropped when no tools) are real codec canonicalizations the generated laws cannot see — the
  laws draw Type-side values, so wire-only distinctions never enter. They are pinned as
  observable adapter behaviour in the openai-wire-canonical integration feature, which drives
  the gateway over a real loopback stub and asserts the exact recorded request body.
- The flake itself is a platform defect, not a codec defect: no repo-side change fixes it without
  either narrowing the generator (lone surrogates are valid JSON — forbidden) or replacing
  `JSON.parse` (a hand-rolled parser). CI stays exposed until the runtime is fixed; an upstream
  report with the reproducer above ships in the PR body.

## Recognition and response

- `ReplayNoLongerReproduces` on a **freshly captured** token plus "N of M sweeps failed" is the
  fingerprint of this class: token replay reconstructs the shrunk path, but the failure depends on
  process-warm parse state, not on the draw.
- Do not chase the shrunk counterexample: it re-evaluates green by construction. Reproduce with the
  in-process `checkEffect` harness instead.
- Do not narrow the JsonObject generator or delete the law: the inputs are valid JSON and the law
  is correct; both moves hide the runtime defect.
