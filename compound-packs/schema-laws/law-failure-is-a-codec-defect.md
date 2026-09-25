---
title: A failing generated schema law is fixed in the codec, never in the law, the generator, or the export
applies_when:
  - a generated round-trip or encode-stability law in schema-laws.test.ts fails
  - a schema law shrinks to an empty or trivial counterexample
  - writing a transformation, composition, or custom encoding that changes a value's representation
  - tempted to narrow a schema's arbitrary, un-export a schema, or hand-write a replacement test to get the law green
tags: [schema-laws, codec, round-trip, encode-stability, ruleOfSchemas, effect-schema-vite]
---

`@systemfsoftware/effect-schema-vite` regenerates `src/schema-laws.test.ts` from every exported schema and registers two laws per schema through `ruleOfSchemas`: round-trip identity (`∀x_<Name>_=x`) and encode stability (`∀x_<Name>Enc_=x`). The laws hold for every lawful codec, so a failure means the codec loses or reshapes information.

## Rule

Fix the schema. Typical causes: a lossy encode (dropping precision, case, or whitespace), a transform whose callbacks exchange the wrong side's type, or a composition whose intermediate `Type` and `Encoded` do not line up.

Never do any of these to make the law pass:

- **Narrow the arbitrary** so it stops producing the failing value. The failing value is valid input, and hiding it ships the bug.
- **Stop exporting the schema** or move it out of the scanned directory. That removes the law, not the defect.
- **Hand-write a replacement law test.** `no-test-file-in-src` bans a `*.schema.test.ts` in `src/`.
- **Edit `schema-laws.test.ts`.** The plugin rewrites it on the next run.

Diagnosis order for a failing law: `docs/solutions/test-failures/effect-schema-law-failure-diagnosis.md`.

Gate: `pnpm --filter <pkg> test` runs the generated laws; `review` rejects a fix that touches the arbitrary, the export, or the generated file instead of the codec.
