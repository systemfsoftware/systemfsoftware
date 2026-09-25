# Schema Laws Compound Pack

Judgment for Effect `Schema` design, codec laws, and test ownership of schemas. Schemas carry their own domain rules, so an invalid value or state fails at decode instead of being re-checked in consuming code. Codecs are verified by `@systemfsoftware/effect-schema-law` and the laws `@systemfsoftware/effect-schema-vite` generates for every exported schema.

What lint already enforces (declaration location, what a `*.schema.ts` may export, tagged-error forms) is not repeated here; see `@systemfsoftware/oxlint-plugin-effect-schema`. The design law these rules apply to Effect Schema is in `CONSTITUTION.md` (illegal states unrepresentable, brands, CONST-D4).

Rules in this pack govern:

- Refining a value that carries a domain invariant, and branding it when it has domain meaning (`invariants-as-refinements`).
- Declaring a relation between fields as a struct-level check (`cross-field-invariants-as-struct-checks`).
- Modeling mutually exclusive states as a tagged union instead of a record whose state shows in which fields are present (`tagged-unions-over-state-by-presence`).
- Decoding a wire shape a third party owns into a rich domain Type (`rich-type-over-foreign-encoded`).
- Keeping schema classes to the contracts that require them, holding data only (`data-only-schema-classes`).
- Keeping schemas out of tests, and test-only exports out of production (`tests-own-no-schemas`).
- Fixing a failing generated law in the codec, never in the law, the generator, or the export (`law-failure-is-a-codec-defect`).
- Stating a refined schema's refusal boundary in its own file, because generated laws only prove acceptance (`refusals-beside-generated-laws`).
- Generating refined values constructively instead of by rejection sampling (`arbitrary-filter-floors`).
- Closing recursive schemas with `Schema.suspend` and declaring the recursion budget at the recursion point (`recursive-schema-suspend`).

Consuming code that re-checks a value it already decoded is itself a trigger: `invariants-as-refinements` covers a range, format, or set re-check, and `tagged-unions-over-state-by-presence` covers a guard on state or field presence.
