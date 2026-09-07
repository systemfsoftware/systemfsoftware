---
name: systemfsoftware
last_updated: 2026-09-06
---

# systemfsoftware Strategy

## Purpose

LLM-authored code is unmaintainable slop nobody can trust: its tests are tautologies that
certify nothing, and nobody will review it. Trust can't come from the author or the reviewer —
both are the same machine — so working software has to be proven by mechanisms that re-fire,
never claimed by process.

## Positioning

Any code that needs to be fixed but can regress without the compiler or a lint gate failing
is an automatic F. Every doctrine rule ships as a mechanism that re-fires — compiler, linter,
mutator — never as prose the model must recall.

## Users

**Primary:** Engineers shipping production Effect-TS TypeScript written and first-reviewed by
AI — they're hiring systemfsoftware so human judgment lives only at the specification level:
humans write intent, machines write and verify code.

## Boundaries

- No non-Effect TypeScript ports. Effect-TS or die.
- No LLM-as-judge review products. Gates are mechanisms, not model opinions.

_Resist a change when:_ it trades the mechanism for reach or judgment — wider adoption without
a gate, or a model's opinion in place of a command that fails.

## Key metrics

- **GitHub stars** — the distribution signal; lives on the repo page.

<!-- Worth revisiting: the value-side metric — what proves "trust without review" is real in a
consumer's repo — is still unnamed. Escape rate was rejected as unmeasurable; download/adoption
counts were rejected as vanity. -->

## Tracks

### Cell architecture

The type surface that makes illegal programs unrepresentable — sandwich order and service
requirements carried by the compiler.

_Why it serves the approach:_ the compiler is the strongest gate; a defect the type system
refuses can never regress silently.

### The gate fleet

Lint rules, schema laws and refutation, mutation gating — machinery catching every defect
class the compiler can't.

_Why it serves the approach:_ the "automatic F" rule operationalized — every advisory doctrine
row becomes a command that fails.

### The flagship proof

The stryker-js engine and CLI held to the doctrine end-to-end, plus the packaging discipline
(generated exports, attw, api-extractor rollups) that makes the stack adoptable by strangers.

_Why it serves the approach:_ a real product surviving these rules is the credibility — and
the mutator that grades the rest.

## Brand

**One-liner:** The final state of machine-generated TypeScript that doesn't suck.

**Key message:** You can trust it works in production. The tests are actually real.
