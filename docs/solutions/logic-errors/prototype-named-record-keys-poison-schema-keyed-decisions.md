---
title: Prototype-named record keys poisoned every schema-keyed decision lookup
date: "2026-09-10"
category: logic-errors
module: systemfsoftware
problem_type: logic_error
component: testing_framework
symptoms:
  - "A property suite falsified on shrunk input whose mutant id was the string toString, crashing the decision with TypeError: diags.map is not a function"
  - "The crash came from inside the decision: an empty diagnostics record answered a mutant-id lookup with an inherited function"
  - "Only ids colliding with Object.prototype member names failed; ordinary uuid-shaped ids passed every run"
root_cause: logic_error
resolution_type: code_fix
severity: medium
related_components:
  - packages/stryker-js/stryker-js-typescript-checker
  - packages/oxlint-plugin/oxlint-plugin-property-testing
tags:
  - prototype-pollution
  - schema-validation
  - property-testing
  - record-lookup
  - null-prototype
---

# Prototype-named record keys poisoned every schema-keyed decision lookup

## Problem

A pure decision built its working records as plain object literals and then read them with arbitrary schema-valid strings as keys. A schema that types an identifier as `S.String` with a length bound admits `"toString"`, `"valueOf"`, `"hasOwnProperty"`, and every other `Object.prototype` member name. For such a key, `record[key]` does not miss — it walks the prototype chain and returns the inherited function. The empty-record case is the vicious one: `definitive` with no own properties still answers `definitive["toString"]` with `Object.prototype.toString`, so an `undefined` guard built to detect "no diagnostics for this mutant" passed, and the code then called a method that only arrays have.

The trigger was not exotic input. The property suite that found it generates identifiers straight from the input schema — the same values a real Stryker worker can carry. Any consumer-created mutant id matching an inherited member name crashed the check result instead of producing a verdict.

## Failure modes

1. **Inherited-member shadowing.** `record[key]` on a prototype-bearing object conflates "own key absent" with "inherited member present". A guard written as `value !== undefined` cannot distinguish them, and the type system reads both as `V | undefined` only because the lookup site forgets the record's prototype is populated.

2. **Generator narrowing as false prevention.** The tempting fix — filter generated ids away from prototype names — narrows the test instead of the defect. The schema remains the contract: whatever it admits, the decision must classify. A filter turns a crash into a coverage hole that the first real `"toString"` id reopens.

3. **Per-site guarding.** Sprinkling `Object.hasOwn` at each read protects those reads and silently misses the next one. The defect class lives at construction: a record keyed by untrusted strings must be built without a populated prototype, or every read of it must be own-key.

## Architectural invariant

> A record keyed by values a schema admits must never resolve an inherited member. Either construct it with a null prototype, or read it only through an own-key check. Every record that participates in a schema-keyed lookup satisfies at least one of the two; satisfying neither is the defect, regardless of whether today's generators produce such keys.

The checker now builds its accumulators (per-mutant diagnostics, retest marks, results) through a `bareRecord` helper that copies entries and severs the prototype, and reads its schema-decoded input node map through `nodeAt`, an own-key (`Object.hasOwn`) reader. Both shapes satisfy the invariant; the construction shape is preferred where the record is local, the read shape where the record arrives from a decode boundary the decision does not own.

## Verification

- **Quantified regression property.** The suite that surfaced the defect quantifies over the input schema itself — `S.Int`-generated seeds and schema-valid identifier strings — so the shrinker, not a hand-picked case, drives toward prototype-named keys. With the plain-object records restored, the property falsifies and shrinks to a member-named id; with either invariant shape in place, it holds. Red before, green after is the evidence, not a bespoke unit test for one name.

- **Code smells to grep.** `const [name]: Record<string,` declarations initialized from `{}` whose keys come from schema-typed strings, read without `Object.hasOwn`, are the smell. The complementary smell is a generator filter excluding prototype member names — it signals the author met the defect and narrowed the test instead of the record.

- **Boundary note.** `S.Record` decoding produces plain objects, so records that arrive decoded (the input node map) need the own-key read even though the decision never constructs them.

## Prevention

Treat "keyed by schema-valid strings" as the marker that pulls in the invariant: schema review and lint review both ask how such a record answers an inherited name. Prefer constructing accumulators prototype-free at birth; reserve own-key readers for decoded inputs. Do not admit generator-side filters as fixes — they trade a crash the suite can see for a hole the suite cannot.
