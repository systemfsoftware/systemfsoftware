---
title: One-Way Schemas in the Generated Schema Laws - Plan
type: feat
date: 2026-11-22
topic: one-way-schema-laws
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# One-Way Schemas in the Generated Schema Laws - Plan

## Goal Capsule

- **Objective:** A schema that forbids a direction the way Effect's documentation says to declare a one-way transformation gets generated laws that state what is true of it. A reader can tell from a law's title whether a round trip was checked, and forbidding a direction cannot hide a broken codec.
- **Means:**
  - `@systemfsoftware/effect-schema-law` judges every draw by the outcome the codec returns, and recognises a refusal by its `Forbidden` schema issue (KTD1, KTD2).
  - A registration-time sample decides only how the laws are titled and whether the surviving direction gets its own law (KTD3).
  - The schema-modelling pack states when a direction may be forbidden (KTD7).
- **Product authority:** the Effect Schema v4 documentation, quoted in Sources. Where this plan, a pack rule or the package README disagrees with it, the documentation wins and the other text changes.
- **Stop conditions:**
  - **Done:** the documentation's own one-way example (a content digest with `SchemaGetter.forbidden` on encode) passes `ruleOfSchemas` under titles that name the refusal; every schema that passes today still passes under today's titles; every wrong implementation listed in R13 turns a law red.
  - **Not done:** any of the following does not meet the Objective:
    - a schema that forbids a direction is skipped by the generator or registers no law;
    - a schema is recognised as one-way by its name, its file, an annotation or the shape of its syntax tree;
    - a law reports passed for a relation no draw evaluated;
    - an encode that fails with any issue other than `Forbidden` is treated as a refusal.
- **Execution profile:** one pull request in this repository carrying all three units. Agents author it; the repository's lead merges it after review. Consumers adopt the new package version and pack text under their own plans.

---

## Product Contract

### Summary

Effect Schema lets a transformation refuse one direction: `SchemaGetter.forbidden` on encode makes a decode-only schema, and the refusal comes back as a `Forbidden` schema issue. The generated laws treat every schema as a two-way codec, so a correctly declared one-way schema is refuted on its first draw. This plan makes the law suite judge each drawn value by what the codec returns: a value whose encoding is refused has no round trip and nothing to refute, a value that encodes must round-trip, and any other failure refutes as it does today. A one-way schema also gets a law for the direction that still works. The packs gain the rule for when a direction may be forbidden, so the new laws cannot be used as a way around a failing one.

### Problem Frame

The documentation defines the round trip from the Type side and says it is not owed by every schema:

> A highly desirable property of a schema is that an encoding-decoding round trip returns a value equivalent to the original: `decode(encode(value)) ≈ value`. The round trip starts with encoding because `value` has type `T`: encoding produces an `E`, which is then decoded back into a `T`. This property is not guaranteed. Some transformations intentionally normalize or discard information during encoding or decoding.

and names the primitive for a direction that should not exist:

> In some cases, encoding a value back to its original form may not make sense or may be undesirable. Use `SchemaGetter.forbidden` for that direction so the restriction is represented as a schema issue.

Three things follow, and the current suite and packs contradict each of them.

1. A value whose encoding is forbidden has no round trip. The round trip "starts with encoding"; a `Forbidden` issue leaves no `E` to decode. `decode(encode(x)) ≈ x` is neither true nor false for that value. Today `ruleOfSchemas` reports it false: `lawsOf` runs the codec through `Schema.encodeOption`, a refusal becomes `None`, and both laws are refuted on the first draw. The package README opens with "A schema is a two-way codec."
2. One-way is represented as a schema issue. Effect puts no marker on the schema. `SchemaGetter.forbidden(message)` returns a fresh closure tagged like any other effectful getter, and Effect's own decode-only and encode-only schemas fail inline with `SchemaIssue.Forbidden` ("Decode only schema", "Encode only schema" in `repos/effect/packages/effect/src/http-api/HttpApiClient.ts` and `HttpApiBuilder.ts`). The only faithful recogniser is the issue the codec returns.
3. The round trip constrains encode, not decode. It starts from a `T`, so a decode that accepts and normalises a broader input breaks nothing ("A transformation can normalize a broader input and report a domain-specific issue when no target value matches."). A normalising decode keeps its round trip by encoding the canonical form, as Effect's own `SchemaTransformation.trim` does with a passthrough encode.

The cost of the gap is concrete. A consumer monorepo holds 27 transformations with a forbidden encode. None of them can enrol in the generated laws, so none has any generated law at all. Read against the documentation, 14 of the 27 discard what an encode would need, which is the documentation's case for one-way; the other 13 are renames, normalising decodes and decodes that add a computed field, which have an honest encode and are forbidden only because nothing calls it. A suite that accepts a refusal needs a rule beside it for when a refusal is honest, or it becomes the quickest way to silence a failing law.

### Requirements

**Outcomes of a codec step**

- R1. Every encode and decode a law performs yields exactly one of four outcomes. A **value**: the step succeeded. **Refused**: the step failed with schema issues only, the issue trees have at least one leaf, and every leaf is `Forbidden`. **Failed**: the same, with at least one leaf that is not `Forbidden`. A **defect**: the step died, was interrupted, or failed with something that is not a schema error.
- R2. A leaf is an issue with no child issue. A composite issue whose list of children is empty is its own leaf, so it is never counted as a refusal.
- R3. Issues are collected with `{ errors: 'all' }`, so a refusal reported beside another failure in the same struct is a failure.
- R4. A defect is reported as `LawErred` with the drawn values, as a throwing codec is today.

**Laws drawn from the Type side, registered for every schema**

- R5. The encode law takes one drawn value `x`. If `encode(x)` is refused, or it yields `e` and `decode(e)` is refused, the value has no round trip and the draw holds. A failed step refutes. Otherwise `decode(e)` is equivalent to `x` and re-encoding it yields a value equivalent to `e`, as today.
- R6. The pair law takes two drawn values. Each goes through R5's steps on its own, whatever happens to the other, and a failed step or a broken identity on either refutes. When both round-trip, today's distinctness check applies as well: the two decoded values are equivalent exactly when the two drawn values are.
- R7. A schema that passes both laws today passes both under the same titles, with the same number of registered tests. The single-inhabitant shortcut applies only to a schema on which no refusal was observed.

**Recognising a one-way schema**

- R8. At registration `ruleOfSchemas` draws a fixed sample of Type-side values (a fixed seed, and every generation size the laws draw at), encodes each, and decodes what encodes. It observes a refused encode, a refused decode of an encoded value, or neither. A sample that cannot be drawn or run synchronously observes neither.
- R9. The observation decides two things and no verdict: the titles of the two Type-side laws, and whether a law for the surviving direction is registered and which one. A schema's verdicts are the same whatever the sample saw.
- R10. Nothing else recognises a one-way schema: no name, file suffix, annotation, export shape or syntax-tree pattern, and nothing in the generator or in discovery.
- R11. When a refusal was observed the Type-side laws are titled `∀x_<name>Enc_→Forbidden|=x` and `∀x_<name>_→Forbidden|=x`. Otherwise they keep `∀x_<name>Enc_=x` and `∀x_<name>_=x`.

**The surviving direction**

- R12. A schema observed refusing to encode registers `∀i_<name>Dec_→Deterministic`, drawn from `Arbitrary.schema(Schema.toEncoded(schema))`: decoding `i` twice yields the same outcome and equivalent values, and a decoded value is one the encode law accepts (R5). A draw that does not decode is not an instance. A schema observed refusing to decode what it encodes registers `∀x_<name>Enc_→Deterministic`, drawn from the schema's own Type side: encoding `x` twice yields the same outcome and equivalent encoded values. An Encoded side with no derivable Arbitrary fails with `LawDrawFailed`, as a Type side does today.

**Honesty of the report**

- R13. Each law is shown red, in the package's own tests, against each of these wrong implementations: an encode that fails with a non-`Forbidden` issue; an encode whose output its own Encoded side rejects with an empty `AnyOf`; a struct with one forbidden field and one field failing for another reason; an encode that throws; a wrong inverse on the values that do encode; a union with a forbidden member and a broken two-way member; a decoder that reads a counter; a decoder that throws on an input its Encoded side admits; a decoder whose output its own Type rejects.
- R14. A law never reports passed for a relation no draw evaluated. A run that held on every draw ends as a skipped test carrying its reason when no draw was an instance: a surviving-direction law on which no drawn value decoded (or encoded), and a Type-side law under an `=x` title on which no value completed a round trip. A law under a `→Forbidden|=x` title has an instance on every draw, because the refusal is part of what it states. A refutation is raised before the count is read, so a skip never hides one.
- R15. The skip reason of a decode law tells the author what to change: declare the wire format on the Encoded side so the generator can draw it, or write the transformation over the parsed value; until then only examples or contract cases exercise the decoder.

**Rule text and documentation**

- R16. The package README states that the round trip starts from a Type value and is the default, that a schema may forbid a direction and then has no round trip for the values it refuses, which laws a one-way schema registers, what they do not prove, and what a skipped law means. It says "equivalent to", not "equals".
- R17. The schema-modelling pack holds one rule for when a direction may be forbidden (KTD7), and the three pack sentences that assume every schema round-trips are corrected (U3).
- R18. The generator's wording stops saying every schema has two laws.

**Release**

- R19. `@systemfsoftware/effect-schema-law` ships as a minor version; any other publishable package whose build hash changes ships the change intent the release tooling asks for.

### Acceptance Examples

- AE1. **The documentation's content digest.** A string decoded to its SHA-256 hex digest with `SchemaGetter.forbidden` on encode registers three tests: `∀x_ContentDigestEnc_→Forbidden|=x`, `∀x_ContentDigest_→Forbidden|=x` and `∀i_ContentDigestDec_→Deterministic`. All pass, and the decode law has an instance on every draw. Covers R5, R8, R11, R12.
- AE2. **A two-way schema.** A branded string and a number-from-string codec register the same two titles as today and pass. Covers R7.
- AE3. **A hybrid.** An array of one-way elements encodes `[]` and refuses every non-empty array. It registers the `→Forbidden|=x` titles; the empty array must round-trip; the decode law runs. Covers R5, R6, R9.
- AE4. **A broken encode is still red.** A codec whose encode fails with `InvalidValue`, and a struct holding a forbidden field beside that codec, are refuted, never held. Covers R1, R3, R13.
- AE5. **A sparse Encoded side.** A one-way transformation fronted by `Schema.fromJsonString` has `String` as its Encoded side; no drawn string decodes; its decode law ends skipped with R15's reason. The same transformation written over the parsed document has instances and passes. Covers R14, R15.
- AE6. **Encode-only.** `Schema.flip` of a decode-only schema registers the refusal titles and `∀x_<name>Enc_→Deterministic`, and passes. Covers R8, R12.

### Scope Boundaries

- The generated laws do not prove that a one-way decode maps each input to the right value. A decoder that returns a constant passes them. That proof is an example, a property of its own, or an adapter's contract cases.
- Decode totality over the Encoded side is not required. The documentation's own `ColorFromString` refuses most strings.
- `recursionLaws` does not change. It never runs its subject's codec.
- A `toCodecArbitrary` generation link is not a codec direction. Effect builds its own with `Schema.linkDecoding`, whose encode is `SchemaGetter.forbiddenEncoding`; a forbidden getter there needs no rule and is not observed by the laws.
- Consumer adoption (auditing existing forbidden encodes against the new rule, enrolling packages) is each consumer's own work.

### Sources

- Effect Schema v4, Round-Trip: https://effect.website/docs/v4/schema/introduction#round-trip
- Effect Schema v4, One-Way Transformations with Forbidden Encoding: https://effect.website/docs/v4/schema/transformations#one-way-transformations-with-forbidden-encoding
- Effect Schema v4, Arbitrary ("To generate encoded values, derive from `Schema.toEncoded(schema)` instead"): https://effect.website/docs/v4/schema/arbitrary
- `repos/effect/packages/effect/src/SchemaGetter.ts`: `forbidden`, `forbiddenEncoding`, `transform` ("Creates a getter that applies a pure function to present values").
- `repos/effect/packages/effect/src/SchemaTransformation.ts`: `trim` ("Encoding is passthrough and returns the string unchanged. This is not round-trippable if the original had whitespace.").
- `repos/effect/packages/effect/src/Schema.ts`: `fromJsonString` ("Returns a schema that decodes a JSON string and then decodes the parsed value using the given schema."), `toEncoded`, `linkDecoding`.
- `repos/effect/packages/effect/src/http-api/HttpApiClient.ts`, `HttpApiBuilder.ts`: Effect's own "Decode only schema" and "Encode only schema".
- `docs/solutions/test-failures/effect-schema-law-failure-diagnosis.md`.

---
## Planning Contract

### Key Technical Decisions

- KTD1. **A refusal is recognised by the `Forbidden` issue the codec returns, per drawn value.** The documentation says the restriction "is represented as a schema issue", and Effect's own one-way schemas raise it inline. Rejected: reading the syntax tree for a forbidden getter. `SchemaGetter.forbidden(message)`, the spelling in the documentation's example, is a fresh closure with no marker (only the `forbiddenEncoding` constant is recognisable, by reference), and whether a schema refuses a value depends on the value: an array, record or option of one-way elements encodes its empty value, a struct's optional forbidden field refuses even when the key is absent, and a union with an overlapping two-way member encodes. A tree walk would have to re-implement the encoder. Rejected: a name, suffix or annotation, which the schema's behaviour can contradict.
- KTD2. **A draw with no round trip holds; it is not discarded and not failed.** Failing it contradicts the documentation. Discarding it with a precondition makes a purely one-way schema exhaust its draws, and hides nothing a held draw would show, since a failed step still refutes.
- KTD3. **The registration sample decides titles and which surviving-direction law exists, never a verdict.** Rejected: letting the sample choose between a "two-way" and a "one-way" rule set. A schema that refuses rarely would be judged two-way and refuted whenever a run drew a refusal, and a hybrid judged one-way would lose the distinctness check on the values that do round-trip. Rejected: no sample, with a third Encoded-side law for every schema. On a consumer package of 1,120 two-way schemas it costs about as much as a third Type-side law and 41 of them decode none of 100 Encoded draws, so it would report a skipped test on schemas that have nothing to do with one-way. Rejected: one title for every schema, which reports a round trip on a schema that has none.
- KTD4. **A law that evaluated nothing ends skipped, never passed and never failed.** Failing it was measured against real code: in a consumer package, 8 of 25 one-way schemas decode none of 200 Encoded draws, because the wire declares a date as a plain string or the Encoded side is JSON text. They are working decoders; the gap is in what the generator can draw, and a declared pattern on the field closes it (0 of 200 to 200 of 200). Passing it reports a check that did not happen.
- KTD5. **Encoded values come from `Schema.toEncoded(schema)`**, the documentation's way ("To generate encoded values, derive from `Schema.toEncoded(schema)` instead"). Rejected: `Schema.flip` for the decode law, which fails on a schema whose Encoded side has no Arbitrary and adds nothing. Rejected: generating through the two-way prefix of a composed transformation, which needs surgery on the syntax tree.
- KTD6. **The codec runs through the synchronous Exit API.** `Schema.encodeOption` throws on a non-schema failure and cannot tell a refusal from a failure. A getter that is asynchronous dies under the synchronous API and is reported as `LawErred`, as today; it is not a `Forbidden` issue.
- KTD7. **The rule for forbidding a direction is narrower than the documentation's permission, on purpose.** The documentation allows `SchemaGetter.forbidden` where the direction "may not make sense or may be undesirable" and calls the round trip "highly desirable". The pack rule allows it only when no honest value exists for the direction: the other direction maps inputs that mean different things to one value, or the inverse cannot or must not be computed. A transformation that keeps every distinction, or only normalises, keeps its round trip. This contradicts no sentence of the documentation, and it is what stops a forbidden getter from being the answer to a failing law. Rejected: the documentation's full latitude ("nothing calls encode"), under which the two-way laws stop proving the mapping for any codec whose author opts out. Rejected: one-way only for payloads a third party owns; the documentation's examples are a digest and a password hash.
- KTD8. **One pull request, and a minor version of the law package.** The suite and the pack text describe the same behaviour and are wrong apart. No export changes, no passing schema turns red and two-way titles are unchanged; schemas that were refuted for refusing now pass under new titles.

### Evidence

Measured with effect 4.1.4 and vitest 5.1.0 on scratch prototypes of these laws; nothing here is estimated.

| What was measured | Result |
| --- | --- |
| The current suite on a decode-only schema, an array of them, and `Schema.flip` of one | Both laws refuted, on the first draw for the plain schema |
| Issue tree of a refused encode | `Forbidden` under `Encoding`, `Pointer`, `Composite` or `AnyOf` wrappers; with default options a struct reports only its first failing field, with `{ errors: 'all' }` it reports both |
| A union that matches no member | `AnyOf` with an empty list of issues |
| An asynchronous getter under the synchronous API | Dies; no `Forbidden` issue |
| The sample (3 values at each size 0 to 10) on a consumer package's 1,120 exported two-way schemas | No refusal observed on any; 1.5 ms per schema, 30 ms for the slowest |
| The sample on another consumer package: 25 one-way schemas among 215 | All 25 observed refusing; none of the other 190 |
| The decode law, 200 Encoded draws, on those 25 | No decoder gave two outcomes; 17 had decoding draws; 8 had none |
| A struct with a date in a plain string field, before and after a pattern check on the field | 0 of 200 draws decode; 200 of 200 |
| 200 runs of 100 draws on 11 schemas refusing between 3% and 95% of values | No run without a round-trip draw. The sample missed two schemas, refusing 3% and 13% |
| Prototype suite: 69 tests over two-way, one-way, hybrid, encode-only and deliberately broken schemas | Every intended failure red, everything else green or skipped with its reason |
| `ctx.skip(note)` called after a property has run, vitest 5.1.0 | The test reports skipped and prints the note |

### Known Limits

- A schema that refuses so rarely that the sample sees none keeps today's titles and gets no surviving-direction law. Its verdicts are unaffected (R9).
- A one-way schema whose Encoded side the generator cannot draw decodable values from reports a skipped decode law until its author declares the wire format or restructures (R15).
- The generated laws of a one-way schema check clean refusal and determinism. They do not check the mapping (Scope Boundaries).
---

## Implementation Units

### U1. Per-draw outcomes and the one-way laws

- **Goal:** R1 to R16, R19.
- **Dependencies:** none.
- **Files:**
  - `packages/schema/effect-schema-law/src/RuleOfSchemas.ts` and its in-source tests;
  - `packages/schema/effect-schema-law/src/property.ts`;
  - a new module beside them for the outcome of a codec step, if that keeps each module to one job;
  - `packages/schema/effect-schema-law/README.md`;
  - `packages/schema/effect-schema-law/etc/effect-schema-law.api.md`, only if the public surface moves;
  - a minor change intent for `@systemfsoftware/effect-schema-law`.
- **Approach:** KTD1 to KTD6, KTD8. The outcome of a step is a closed tagged union with one variant per outcome in R1. The property runner learns whether a draw was an instance, and ends a run that held with no instance as a skipped test with the law's reason. The count is read only after the property has passed, so shrinking and replay are untouched. `ruleOfSchemas(label, schema, { runs })` applies its budget to every law it registers.
- **Patterns:** the existing `apartVerdict`, `LawRefuted`, `LawErred` and `LawDrawFailed`; the in-source test style of `RuleOfSchemas.ts`; `docs/solutions/test-failures/effect-schema-law-failure-diagnosis.md`.
- **Execution note:** write each red case of R13 first and watch it fail for the stated reason before the law that catches it is finished (pack: property-testing, properties-are-shown-to-fail.md).
- **Test scenarios:**
  - AE1 to AE6 as written.
  - A schema with one inhabitant and a forbidden encode registers the refusal titles, not the single-inhabitant shortcut.
  - A schema that refuses about one value in thirty, unseen by the sample, registers today's two titles and passes; a drawn refusal holds.
  - Each wrong implementation of R13 turns the named law red: non-`Forbidden` encode failure, empty `AnyOf` from the encode's own Encoded side, forbidden field beside a failing field, throwing encode (`LawErred`), wrong inverse on the values that encode, union of a forbidden member and a broken two-way member, decoder reading a counter, decoder throwing on an admitted input (`LawErred`), decoder whose output its Type rejects.
  - A decode-only schema whose Encoded side has no derivable Arbitrary fails its decode law with `LawDrawFailed`.
  - A decode law on which no draw decodes ends skipped and prints R15's reason; the same schema with a pattern on the Encoded field passes with instances.
  - An asynchronous getter is reported as `LawErred`, not as a refusal.
- **Verification:** the package's tests, typecheck, lint and `api:check` pass; the README's example output matches what the tests register.

### U2. Generator wording

- **Goal:** R18.
- **Dependencies:** U1.
- **Files:** `packages/schema/effect-schema-vite/src/mod.ts` (the doc comment on `InlineSchemaTestsOptions.runs`), `packages/schema/effect-schema-vite/README.md`, and the change intent the release tooling asks for.
- **Approach:** the generator keeps emitting `ruleOfSchemas(label, schema)` and `recursionLaws(label, schema)` for every exported schema (R10). Only the sentences that say a schema has two laws, or that every schema is checked for a round trip, change.
- **Test expectation:** none; the emitted source is unchanged and its existing tests cover it.
- **Verification:** the package's existing tests and typecheck pass.

### U3. Pack text

- **Goal:** R17.
- **Dependencies:** U1, so the text never describes laws the suite does not have.
- **Files:**
  - `compound-packs/schema-modelling/one-way-codecs-forbid-a-direction-only-when-no-honest-value-exists.md` (new);
  - `compound-packs/schema-modelling/law-failures-are-codec-defects.md`;
  - `compound-packs/schema-modelling/foreign-wire-shapes-are-the-encoded-side.md`;
  - `compound-packs/property-testing/properties-state-what-the-contract-claims.md`;
  - `compound-packs/schema-modelling/README.md`, if its summary no longer covers the pack.
- **Approach:** KTD7. The new rule owns the test for forbidding a direction; the other files point to it and do not restate it. Its frontmatter carries a `title`, `applies_when` lines written as situations (writing a transformation whose encode or decode is `SchemaGetter.forbidden`; writing a codec whose decode drops or merges what it reads; reviewing a schema that refuses to encode or to decode) and `tags: [schema, codec, one-way, forbidden]`. Its body is the draft in the Appendix: always/never prose and one WRONG/RIGHT pair, with no law titles and no generation-link detail. Failing-law situations stay in `law-failures-are-codec-defects.md`.
- **Changes to existing sentences:**
  - `law-failures-are-codec-defects.md` gains: replacing an encode with `SchemaGetter.forbidden` is allowed only when the transformation meets the one-way rule, never to silence a failing law on a lossless or normalising codec. Its trigger and first sentence name the determinism laws beside the round-trip, encode-stability and recursion laws.
  - `foreign-wire-shapes-are-the-encoded-side.md`: "Prove the codec through the port's contract cases … and the schema's generated laws" gains that a codec which forbids encoding follows the one-way rule.
  - `properties-state-what-the-contract-claims.md`: the sentence about generated codec laws keeps its scope, decode after encode, and gains that a schema which forbids a direction still needs an example, a property or contract cases for its mapping.
- **Test expectation:** none; rule text.
- **Verification:** each changed file keeps the frontmatter the pack resolver requires, no two rules in a pack state the same test, and every example is invented and generic (pack: public-repository).

---

## Verification Contract

| Check             | Command                                                                 | Proves                                                        |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- |
| Law package tests | `pnpm --filter @systemfsoftware/effect-schema-law test`                 | AE1 to AE6 and every red case of R13                          |
| Types and lint    | `pnpm --filter @systemfsoftware/effect-schema-law typecheck` and `lint` | The outcome union is closed and the runner's surface is typed |
| Public surface    | `pnpm --filter @systemfsoftware/effect-schema-law api:check`            | No unintended export change                                   |
| Generator package | `pnpm --filter @systemfsoftware/effect-schema-vite test`                | The emitted suite is unchanged                                |
| Repository gate   | `pnpm check:local`                                                      | Formatting, conventions and the affected packages             |
| Change intents    | the Changeset Check on the pull request                                 | R19                                                           |

R7 is checked in this repository by the law package's own two-way cases and by every package whose generated suite registers laws: their titles and results do not change.

---

## Definition of Done

- The documentation's content digest example passes `ruleOfSchemas` with the three titles of AE1.
- Every schema that passed before passes under the same titles, in this repository's own suites.
- Each wrong implementation in R13 has a test that is red for the stated reason without the law and green with it.
- No law reports passed on a run with no instance.
- The README, the generator wording and the four pack files say what the suite does, and nothing in them says every schema is a two-way codec.
- The pull request is green and merged, and the law package is released as a minor version.

---

## Appendix

### Draft body of the new pack rule

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
