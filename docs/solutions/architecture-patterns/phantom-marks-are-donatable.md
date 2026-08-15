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
  - intersecting a marker with a library union such as Effect's `Struct.Field`
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

A wire declaration restates a foreign payload in primitives the workspace owns. Whether a type may be named inside one is a property of that type's _declaration site_, so neither a filename-keyed rule nor a specifier-keyed rule can decide it — the author who writes the violation names the file, and one workspace-local alias defeats the textual predicate.

The type looked like the answer. A phantom `Mark` on the schema, a `mint` constructor as the only place a mark originates, and a `wire(fields)` whose parameter admits only marked members. The design claim that followed was: marking a foreign schema deliberately is the one residual, `mint` is the single call site, so the checker that closes it is one predicate over one call.

That claim is false, and the way it fails generalises to any phantom marker in TypeScript.

## Guidance

**A phantom obtained from a legitimately marked value can be intersected onto any other type.** TypeScript is structural and has no nominal types, so the marker is not a capability — it is a property that travels. Five routes were measured against the built package; every one compiled, and none needed an `as` cast:

| Route                                                                              | Names something from the module?                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `mint(vendorSchema)`                                                               | yes — the intended, visible door                            |
| `declare const x: Schema<Vendor, unknown> & Mark`                                  | yes — `Mark`                                                |
| `declare const x: Minted<Vendor, unknown>`                                         | yes — the exported alias, parameterised by the foreign type |
| `type Stolen = typeof marked extends Schema<string, string> & infer M ? M : never` | **no**                                                      |
| `Object.assign(vendorSchema, markedPrimitive)`                                     | **no** — only a legitimate member                           |

The last row is the one that decides the design. It names no marker, no constructor and no alias; it needs only a value the alphabet must export to be usable at all. A checker watching the marking constructor would see row 1 and miss rows 4 and 5 entirely.

**Hiding the marker does not help.** Not exporting the symbol closes nothing while an alias parameterised by the payload type is exported, and that alias must be exported because it is the combinators' return type. Row 4 needs no export at all.

**Making the mark invariant in its payload closes one route, not the class.** `Mark<in out A>` with a coherence check (`M extends Schema<infer A, any> ? (M extends Mark<A> ? M : never) : never`) was built and measured: it refuses the inferred phantom, and `Object.assign` still passes, because the intersection gives `infer A` a legitimate branch to bind. Half a fix for real added complexity — not shipped.

**So state the guarantee at its true strength.** A phantom marker makes the _accidental_ case a compile error at the authoring site: reaching for the library's primitive instead of the alphabet's, or dropping a vendor schema into a field. That is worth having, and it travels to consumers through the emitted declaration without a lint setup. It is a guardrail, not a boundary, and a design that needs the stronger property must read the member type that arrived and resolve where it was declared — never how it came to be marked.

**Corollary, and a trap with its own failure mode: intersect the marker with the permissive arm of a library union, or the diagnostic reports something unrelated.** Effect's `Struct.Field` is `Schema.All | PropertySignature.All`, and the `All` unions contain `never`-parameterised variants. Widening a field constraint to `Struct.Field & Mark` type-checks and refuses exactly the right programs, while the reported error becomes:

```
Type 'typeof String$' is not assignable to type 'MintedField'.
  Type 'typeof String$' is not assignable to type 'Schema<never, never, unknown>'.
    Types of property 'Type' are incompatible.
      Type 'string' is not assignable to type 'never'.
```

The marker is never mentioned. Assignability fails against the `never` variant before it reaches the intersection's marker member. Using the permissive `Any` arms instead — `(Schema.Any | PropertySignature.Any) & Mark` — refuses the identical set of programs and restores the diagnostic:

```
Property '__WIRE_MEMBER_IS_NOT_BUILT_FROM_THE_ALPHABET__' is missing
  in type 'transform<...>' but required in type 'Mark'.
```

Give the marker member the name a reader needs and the fix as its type, per `REPO-A4`. A prose comment saying a conversion is unsupported is worth nothing; the same sentence in the member name fires at the moment someone attempts it.

## Applicability

This is a property of TypeScript's structural typing, not of Effect or of schemas: it holds for any phantom marker used to gate a position. Reach for one when the cost of the _accidental_ case is what matters and a compile-site error is worth more than a lint finding. Do not build a plan around a marker being an enumerable set of doors.

Two verification habits earned their place here:

- **Pin the forge routes as passing tests.** Each measured route is asserted to compile. They document the true strength of the guarantee and fail loudly if a later change closes one, so the claim is revised deliberately rather than drifting.
- **Assignability to a marker type is a vacuous assertion.** `expect(refined).type.toBeAssignableTo<AnyMinted>()` passes when the value is `any`, which is how a combinator that silently widened its member to `any` shipped green. Name the decoded type — `expect<Schema.Type<typeof refined>>().type.toBe<string>()` — and observe it failing against the broken form before trusting it.

## Related

- `docs/solutions/architecture-patterns/constructor-rule-boundary.md` — establishes marker members whose property NAME is the diagnostic, and places the compiler channel above the file-reading observers. This learning bounds that channel: it is donatable, so it refuses accidents rather than adversaries.
- `docs/solutions/architecture-patterns/label-routed-rules-are-unfalsifiable.md` — why the filename-keyed predicate was rejected before the type was reached for.
- `docs/solutions/architecture-patterns/constraint-reaches-only-via-window-or-gate.md` — the reach question this design answered with the published declaration file.
