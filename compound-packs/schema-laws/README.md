# Schema Laws Compound Pack

Architectural invariants and design law for authoring, verifying, and testing Effect-TS `Schema` declarations using `@systemfsoftware/effect-schema-law`, `@systemfsoftware/effect-schema-vite`, and `@systemfsoftware/oxlint-plugin-effect-schema`.

Every domain boundary in pure-core/imperative-shell architecture relies on Schema codecs to guarantee runtime type safety and contract preservation.

Rules in this pack govern:

- **Dual Codec Round-Trip Laws (`dual-codec-roundtrip-laws.md`)**: Exported domain schemas must satisfy round-trip identity (`decode(encode(x)) === x`) and encode stability across the full domain of valid representations.
- **Automated Law Injection via Vite (`vite-automated-law-injection.md`)**: Packages export schemas from `src/` and integrate `@systemfsoftware/effect-schema-vite` in `vitest.config.ts` to automatically discover schemas and write `schema-laws.test.ts`.
- **Recursive Schema Ceilings & Budgets (`recursive-schema-budgets.md`)**: Recursive schemas using `Schema.suspend` must hoist to a single recursion point and declare an explicit `recursionBudget` annotation to prevent superlinear generation explosions during property tests.
- **Refusals Beside Codec Laws (`refusals-beside-codec-laws.md`)**: Generated property laws only prove acceptance of valid data. Refinements and constrained types must ship explicit negative tests verifying rejection of invalid inputs.
- **Constructive Arbitrary Derivation (`constructive-arbitrary-derivation.md`)**: Schema filter constraints must carry constructive fast-check arbitrary annotations (`arbitraryConstraint`, bounded generators) rather than relying on rejection sampling (`fc.pre`), avoiding test exhaustion traps.
- **Schema Declaration & Export Hygiene (`schema-declaration-and-export-hygiene.md`)**: Schemas must reside in `*.schema.ts` or `*.workflow.ts`. Schema files must export schemas and their type vocabulary only, forbidding runtime codec instances or re-exports.
