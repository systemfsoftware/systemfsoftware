---
title: A Dynamic-Import Binding Leaves a Static Import Tracker Blind
track: knowledge
problem_type: architecture_pattern
module: oxlint
component: property-testing rules
tags: [dynamic-import, fail-open, lint-gate, in-source-tests, opaque-verdict]
severity: high
captured: 2026-09-06
last_updated: 2026-09-06
---

# A Dynamic-Import Binding Leaves a Static Import Tracker Blind

## Context

`prop-arbitrary-schema-origin` must judge every `it.prop` arbitrary in an
`import.meta.vitest` block: schema-derived passes, hand-built `fc.*` reports.
The rule's `Program` visitor collected only static top-level `ImportDeclaration`
edges. Every live in-source block in this repo binds its generators with
`const { FastCheck: fc } = await import('effect/testing')` inside the guard, so
the binding the rule needed to classify never appeared in its import map.

## The failure shape

1. `resolveLocal` found `fc`'s `VariableDeclarator` init: an `AwaitExpression`.
2. `verdictOf` has no arm for `AwaitExpression`, so it fell to `default: opaque`.
3. Opaque fails open by design (no accusation without proof), so every real
   hand-built arbitrary — `fc.integer`, `fc.stringMatching`, `fc.record` — was
   invisible to an error-severity gate. The suite stayed green on fixtures that
   used static imports, which is exactly the population the repo does not have.

The general defect: an enforcement rule whose input model covers the imports of
one module style silently degrades to no-op on the other style, while its test
fixtures — written in the style the rule understands — certify it as working.

## Guidance

- When a rule classifies identifiers by provenance, enumerate **every binding
  form the target corpus actually uses** before writing the visitor: static
  imports, guard-local dynamic `await import(...)`, and re-exports. Grep the
  corpus for the binding idiom first, not the rule's own fixtures.
- A verdict lattice needs a stated fail direction. Fail open (`opaque`, no
  report) only with a named backstop for the cases the static rule cannot see —
  here, companion decode audits beside each opaque arbitrary.
- Pin the corpus's real idiom, not just the synthetic one: the suite needed an
  invalid fixture shaped like `await import('effect/testing')` inside the
  guard, or it could not detect the blind spot at all.

## Applicability

Any type-blind or graph-light static rule over code that loads dependencies
lazily: lint rules on test idioms, dependency-cruiser-style boundaries, codemods
that rewrite import sites. If the rule's fixtures all import one way and the
codebase imports another way, the gate's green is decorative.

## Prevention

Run one differential probe before shipping a gate: plant the violation **in the
idiom the corpus actually uses**, run the gate, and require red. A planted
violation in the fixture idiom proves nothing about the corpus idiom.
