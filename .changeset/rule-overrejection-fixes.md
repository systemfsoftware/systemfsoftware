---
"@systemfsoftware/oxlint-plugin": patch
"@systemfsoftware/oxlint-plugin-effect-schema": patch
---

Rescope three rules that over-rejected legitimate files.

Each was a measured false positive, not a theoretical one — all three fired on files written in the
course of shipping `Workflow.make`:

- `cell-suffix-required` rejected `src/Workflow.ts`, a PascalCase contract module whose basename names
  no cell because it _is_ the package's published contract. It now exempts that shape.
- `no-manual-tag-member`, `no-direct-tag-access`, and `ban-data-taggederror` rejected `**/*.tst.ts`
  type-test fixtures, which must contain no runtime values and therefore cannot use
  `S.TaggedStruct`. The fix each rule suggested was impossible in the file it was suggesting it for.

This is the cost the cell-taxonomy derivation already prices: a depth-0 rule cannot miss its target, but
its predicate is a proxy for the property actually wanted, so it over-rejects — and that cost is meant
to be priced per rule rather than waved away. Three rules, three over-rejections, all rescoped by
narrowing the predicate; none was deleted and no config was weakened.
