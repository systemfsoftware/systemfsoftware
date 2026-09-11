---
title: A phantom mark refuses accidents, not adversaries, because any marked value can donate it
date: 2026-08-15
category: architecture-patterns
module: effect-cell-types
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - designing a type-level marker that admits some values into a position and refuses others
  - claiming a marking constructor is the single call site a checker has to inspect
  - intersecting a marker with a library's field-position constraint
  - deciding whether a type or a checker should carry an admissibility constraint
tags:
  - typescript
  - type-level-enforcement
  - phantom-type
  - nominal-typing
  - diagnostics
  - effect-ts
  - enforcement-channel
---

# A phantom mark refuses accidents, not adversaries, because any marked value can donate it

## Context

A schema-authoring gate restates a foreign payload in primitives the workspace declares. Whether a type may be named inside one is a property of that type's _declaration site_, so neither a filename-keyed rule nor a specifier-keyed rule can decide it — the author who writes the violation names the file, and one workspace-local alias defeats the textual predicate.

The type looked like the answer. A phantom marker on the schema, a marking constructor as the only place a mark originates, and a fields parameter typed to admit only marked members. The design claim that followed was: marking a foreign schema deliberately is the one residual, the constructor is the single call site, so the checker that closes it is one predicate over one call.

That claim is false, and the way it fails generalises to any phantom marker in TypeScript.

## Guidance

**A phantom obtained from a legitimately marked value can be intersected onto any other type.** TypeScript is structural and has no nominal types, so the marker is not a capability — it is a property that travels. Five routes compile against such a marker, and none needs an `as` cast:

| Route                                                                              | Names an exported marker symbol?                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| The marking constructor applied to a vendor schema                                 | yes — the intended, visible door                            |
| `declare const x: Schema<Vendor, unknown> & Marker`                                | yes — the marker type                                       |
| `declare const x: Marked<Vendor, unknown>`                                         | yes — the exported alias, parameterised by the foreign type |
| `type Stolen = typeof marked extends Schema<string, string> & infer M ? M : never` | **no**                                                      |
| `Object.assign(vendorSchema, markedPrimitive)`                                     | **no** — only a legitimately marked value                   |

The last row is the one that decides the design. It names no marker, no constructor and no alias; it needs only a legitimately marked value the marking module must export to be usable at all. A checker watching the marking constructor would see row 1 and miss rows 4 and 5 entirely.

**Hiding the marker does not help.** Not exporting the symbol closes nothing while an alias parameterised by the payload type is exported, and that alias must be exported because it is the constructor's return type. Row 4 needs no export at all.

**Making the mark invariant in its payload closes one route, not the class.** An invariant `Marker<in out A>` with a coherence check (`M extends Schema<infer A, any> ? (M extends Marker<A> ? M : never) : never`) refuses the inferred phantom, and `Object.assign` still passes, because the intersection gives `infer A` a legitimate branch to bind. It closes one route, for real added complexity.

**So state the guarantee at its true strength.** A phantom marker makes the _accidental_ case a compile error at the authoring site: reaching for the library's primitive instead of the gate's, or dropping a vendor schema into a field. That is worth having, and it travels to consumers through the emitted declaration without a lint setup. It is a guardrail, not a boundary, and a design that needs the stronger property must read the member type that arrived and resolve where it was declared — never how it came to be marked.

**Corollary, and a trap with its own failure mode: intersect the marker with the permissive arm of a library union, or the diagnostic reports something unrelated.** A field position in a library's type is often a union whose arms include a `never`-parameterised variant. Widening a field constraint to the restrictive arm intersected with the marker type-checks and refuses exactly the right programs, but the reported error is dominated by the `never` arm: assignability fails there before it reaches the intersection's marker member, so the error never mentions the marker. Intersecting the permissive arms instead refuses the identical set of programs and restores the diagnostic, which then names the missing marker member.

Give the marker member the name a reader needs and the fix as its type. A prose comment saying a conversion is unsupported is worth nothing; the same sentence in the member name fires at the moment someone attempts it.

## Applicability

This is a property of TypeScript's structural typing, not of Effect or of schemas: it holds for any phantom marker used to gate a position. Reach for one when the cost of the _accidental_ case is what matters and a compile-site error is worth more than a lint finding. The workspace carries one today — `WorkflowBrand`, the phantom `Workflow.make` returns — and it is donatable by the same routes. Do not build a plan around a marker being an enumerable set of doors.

Two verification habits earned their place here:

- **Pin the forge routes as passing tests.** When you ship a phantom marker, pin its measured forgery routes as passing tests: they document the true strength of the guarantee and fail loudly if a later change closes one, so the claim is revised deliberately rather than drifting.
- **Assignability to a marker type is a vacuous assertion.** An assignability check against a marker type passes when the value is `any`, which is how a combinator that silently widened its member to `any` shipped green. Name the decoded type — `expect<Schema.Type<typeof refined>>().type.toBe<string>()` — and observe it failing against the broken form before trusting it.

`docs/solutions/architecture-patterns/a-schema-type-claim-can-outrun-its-examination.md` records every form of type claim nothing in this workspace refuses, including the vendor-schema-in-a-field case a phantom marker refuses at the compiler.

## Related

- `docs/solutions/architecture-patterns/constructor-rule-boundary.md` — establishes marker members whose property NAME is the diagnostic, and records where the compiler channel displaces the file-reading observers on the `workflow` cell. This learning bounds that channel: it is donatable, so it refuses accidents rather than adversaries.
- `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md` — why the filename-keyed predicate was rejected before the type was reached for.
- `docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md` — the reach question a published declaration file answers.
