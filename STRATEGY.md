---
name: systemfsoftware
last_updated: 2026-09-23
---

# systemfsoftware Strategy

## Purpose

LLM-authored code is unmaintainable slop nobody can trust: its tests are tautologies that
certify nothing, and nobody will review it. Trust can't come from the author or the reviewer —
both are the same machine — so working software has to be proven by mechanisms that re-fire,
never claimed by process.

## Positioning

Any code that needs to be fixed but can regress without the compiler, an Oxlint rule, or a mutation
test failing is an automatic F. Every doctrine rule ships as an executable mechanism that re-fires
deterministically — compiler types, AST plugins, property laws, or non-autoregressive decision models —
never as prose instructions or conversational opinions a model must recall.

## Users

**Primary:** Engineers shipping production Effect-TS TypeScript written and first-reviewed by
AI — they're hiring systemfsoftware so human judgment lives only at the specification level:
humans write intent, machines write and verify code.

## Boundaries

- No non-Effect TypeScript ports. Effect-TS or die.
- No LLM-as-judge review products. Gates are deterministic mechanisms, not model opinions: AST linters,
  type checks, and ~35ms non-autoregressive forward passes (Jev DecisionModel) with tri-state thresholding
  (Match $\ge 0.80$, Miss $\le 0.50$, Uncertain $0.50-0.80$), never conversational prompts, chat reviews, or
  uncalibrated text-streaming opinions.

_Resist a change when:_ it trades the mechanism for reach or judgment — wider adoption without
a gate, or a model's conversational opinion in place of an executable command that fails.

## Key metrics

- **GitHub stars** — the distribution signal; lives on the repo page.

<!-- Worth revisiting: the value-side metric — what proves "trust without review" is real in a
consumer's repo — is still unnamed. Escape rate was rejected as unmeasurable; download/adoption
counts were rejected as vanity. -->

## Tracks

### Cell architecture

The type surface and 5-phase sandwich runtime that makes illegal programs unrepresentable — schema-derived
decode/encode edges, pure CC=1 workflows, and single-site context provisioning.

_Why it serves the approach:_ the compiler is the strongest gate; a defect the type system
refuses can never regress silently.

### Deterministic AST & schema gates

Oxlint static plugins, bidirectional schema roundtrip laws, recursion depth budgets, and Stryker mutation
analysis — automated machinery catching defect classes compiler types alone cannot observe.

_Why it serves the approach:_ the "automatic F" rule operationalized — every advisory doctrine
row becomes a command that fails in local checks and CI.

### System One decision gates (Jev)

Non-autoregressive forward-pass decision models integrated via Effect v4's `Decision` and `DecisionModel`
primitives (`effect/unstable/ai/Decision`) for questions AST linting cannot decide (semantic breaking changes,
regression triage) using calibrated three-valued logic.

_Why it serves the approach:_ provides fast (~35ms), reproducible, unprompted classification without
sliding into ungrounded conversational LLM reviews.

### Flagship proofs & reference architectures

The Stryker CLI mutation engine, modular Oxlint plugin/preset packages, and the end-to-end e-commerce
fulfillment reference stack (`examples/inventory-fulfillment`), held to the doctrine with strict packaging
discipline (attw, api-extractor rollups).

_Why it serves the approach:_ real, production-grade applications and developer tools surviving these rules
provide tangible credibility and prevent the architecture from degenerating into ivory-tower formalism.

## Brand

**One-liner:** The final state of machine-generated TypeScript that doesn't suck.

**Key message:** You can trust it works in production. The tests are actually real.
