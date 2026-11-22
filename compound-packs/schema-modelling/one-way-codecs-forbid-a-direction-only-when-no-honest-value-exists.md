---
title: A codec forbids a direction only when no honest value exists for it, never to silence a failing law
applies_when:
  - writing a transformation whose encode or decode is `SchemaGetter.forbidden`
  - writing a codec whose decode drops or merges what it reads
  - reviewing a schema that refuses to encode or to decode
tags: [schema, codec, one-way, forbidden]
---

Forbid a direction of a codec only when no honest value exists for it. Either the other direction maps inputs that mean different things to one value, so any inverse would assert a fact the value does not hold (a status string to a boolean, rows to a total, a document to the list of its paths); or the inverse cannot be computed or must not be (a digest, a password hash). Judge only the fields the transformation reads. The same test applies to forbidding decode.

Never forbid a direction because nothing calls it, and never to make a failing generated law pass. A transformation that keeps every distinction has an inverse: write it. One that only normalises (trims, folds case, folds a sentinel or a combination of nulls into one variant) encodes the canonical form. A value computed from other fields of the same value is an exported function of that value, not a stored field (schema-classes-hold-data-only.md).

Declare the refusal with `SchemaGetter.forbidden(message)`, so it is a `Forbidden` schema issue. Never throw, fail with another issue, or return a placeholder.

Write a one-way transformation over the parsed value. When the input is JSON text, export the schema over the parsed value and apply `Schema.fromJsonString` to it where the text is read.

A schema that forbids a direction has no round trip for the values it refuses, and its generated laws do not check what it maps each input to. Prove the mapping with the port's contract cases when the codec is an adapter's (testing pack: adapters-run-against-real-local-resources.md), and with an example or a property of its own when it is a domain transformation.

```typescript
// WRONG: a rename, forbidden because nothing writes it back
export const Listing = ListingWire.pipe(S.decodeTo(ListingRow, {
  decode: SchemaGetter.transform((w) => ({ id: w.listing_id, title: w.listing_title })),
  encode: SchemaGetter.forbidden(() => 'a listing is read, never written'),
}))
// RIGHT: the rename has its inverse
export const Listing = ListingWire.pipe(S.decodeTo(ListingRow, {
  decode: SchemaGetter.transform((w) => ({ id: w.listing_id, title: w.listing_title })),
  encode: SchemaGetter.transform((r) => ({ listing_id: r.id, listing_title: r.title })),
}))
// RIGHT: a digest cannot be turned back into its content
export const ContentDigest = S.String.pipe(S.decodeTo(Sha256Hex, {
  decode: digestOfContent,
  encode: SchemaGetter.forbidden(() => 'a digest cannot be turned back into its content'),
}))
```
