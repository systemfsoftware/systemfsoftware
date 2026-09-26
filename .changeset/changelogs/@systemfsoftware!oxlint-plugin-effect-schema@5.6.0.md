## 5.6.0

### Minor Changes

- New `tagged-error-requires-message` rule, enabled in the recommended config: a `Schema.TaggedError` class must declare a `message` field or a `message` getter.

### Patch Changes

- `schema-declaration-location`'s fix text no longer sends authors to `tests/__fixtures__/<stem>.schema.ts`. It names the production module that owns the concept, or the test harness file (`*.model.ts` or `*.fixture.ts`) for a harness schema.
