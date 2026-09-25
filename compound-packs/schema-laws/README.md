# Schema Laws Compound Pack

Judgment for Effect `Schema` codecs verified by `@systemfsoftware/effect-schema-law` and the laws `@systemfsoftware/effect-schema-vite` generates for every exported schema.

What lint already enforces (declaration location, what a `*.schema.ts` may export, tagged-error forms) is not repeated here; see `@systemfsoftware/oxlint-plugin-effect-schema`.

Rules in this pack govern:

- Fixing a failing generated law in the codec, never in the law, the generator, or the export (`law-failure-is-a-codec-defect`).
- Stating a refined schema's refusal boundary in its own file, because generated laws only prove acceptance (`refusals-beside-generated-laws`).
- Generating refined values constructively instead of by rejection sampling (`arbitrary-filter-floors`).
- Closing recursive schemas with `Schema.suspend` and declaring the recursion budget at the recursion point (`recursive-schema-suspend`).
