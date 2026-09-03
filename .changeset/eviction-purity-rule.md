---
"@systemfsoftware/oxlint-plugin-test-placement": minor
"@systemfsoftware/oxlint-plugin-effect-dmmf": patch
"@systemfsoftware/all": patch
---

New `eviction-purity` rule reports four assertion shapes inside test directories that certify nothing: an expected value recomputed by calling the same helper the code under test calls, a marker constant asserted against its own literal, a bare early return standing where a refusal assertion belongs, and a substring check no valid input can fail. Namespace constructors and matcher factories in the expected slot stay clean; a bare helper call there is the flagged shape.

New `in-source-test-laws-only` rule lets a package declare its in-source surface as laws-only from its own lint config: hand-written runner imports, assertions, snapshots, and guard variants in `src` become errors, with the catalog laws call, property registrations, generated schema laws, type-level assertions, and type-only imports as the sanctioned remainder. Every `run` binds a module-private or unpublished callee.
