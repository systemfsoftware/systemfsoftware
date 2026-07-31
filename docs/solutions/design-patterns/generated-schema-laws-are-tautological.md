---
title: Generated schema laws are tautological — author contract-derived rejection properties
date: 2026-07-31
category: design-patterns
module: effect-schema-law
problem_type: design_pattern
component: testing_framework
severity: high
applies_when:
  - a schema package relies on generated law pairs for verification
  - stryker survivors cluster on S.pattern regexes
  - authoring a property test for a schema that refines a string
  - mutation score looks healthy but pattern-widening mutants survive
  - deciding where a schema rejection property test may live
symptoms:
  - every S.pattern regex mutant survives mutation testing
  - widening the pattern regex changes nothing observable
  - generated round-trip laws never exercise decode rejection
  - the same survivor cluster recurs across sibling schemas
related_components:
  - tooling
tags:
  - mutation-testing
  - property-testing
  - effect-schema
  - fast-check
  - test-taxonomy
  - circular-reasoning
---

# Generated schema laws are tautological — author contract-derived rejection properties

## Context

`packages/hex-schema` looked verified. Every exported schema carried a generated `ruleOfSchemas` pair, the package was wired into real Stryker (`cca5f66e8e`), and the round-trip laws were green at 500/500 inputs. The repo requires 100% mutation on changed pure-core files, and the package's own `stryker.config.json` sets `high: 100, low: 100` while holding `break: 0` — a deliberate ratchet, an admission that the package was climbing toward the gate rather than sitting at it.

The first real run came back at **55.95%**, and the survivors were not scattered. They were a cluster: every `S.pattern(...)` mutant survived, in all five of the package's pattern-carrying schema files — `colon-hex.schema.ts`, `hex-string.schema.ts`, `strict-hex.schema.ts`, `prefixed-hex.schema.ts`, `uint8array-from-prefixed-hex.schema.ts`. Every file that had a pattern to widen had a surviving widening.

The penny dropped on widening a pattern by hand — `{1,2}` to `{1,3}`, a character class extended to admit `g` — and watching _nothing change_. The laws stayed green. Not because the mutants were equivalent, but because the laws could never see the difference. The generator feeding each round-trip is drawn from the schema's **own** arbitrary, and that arbitrary is built out of the same refinement under test. The law reduces to _"values built to match the pattern match the pattern."_ A wider pattern still accepts every generated value, so the widening is invisible.

## Guidance

**If a schema's `S.pattern(...)` (or any refinement) mutants survive while its round-trip laws stay green, the laws are tautological with respect to that refinement. Stop adding round-trip laws. Author rejection properties whose generators come from the domain contract, never from the pattern literal.**

The mechanism is visible in `packages/effect-schema-law/src/schema.ts`. `ruleOfSchemas` (`schema.ts:13`) registers exactly two properties per schema, and feeds both from the schema itself:

```ts
// packages/effect-schema-law/src/schema.ts:34-42
it.prop(
  `∀x_${name}_=x`,
  [schema], // ← the arbitrary IS the schema under test
  ([value]) => {
    const encoded = encodeSync(value)
    const result = decodeEither(encoded)
    return Either.isRight(result) && typeEq(result.right, value)
  },
)
```

The `[schema]` argument is fast-check drawing from `Schema.Arbitrary`, which the schema's own `S.annotations({ arbitrary })` supplies. Rejection is the one thing that arbitrary is engineered never to produce.

### The circularity has two flavors, and the second is easy to miss

**Verbatim** — the arbitrary restates the pattern's regex character for character:

```ts
// packages/hex-schema/src/hex-string.schema.ts:10-12
S.pattern(/^(0x)?[0-9a-fA-F]*$/),
S.annotations({
  arbitrary: () => (fc) => fc.stringMatching(/^(0x)?[0-9a-fA-F]*$/),
```

**Constructed-to-satisfy** — the arbitrary is a different expression that nonetheless cannot produce a violating value:

```ts
// packages/hex-schema/src/prefixed-hex.schema.ts:7-8
S.pattern(/^0x[0-9a-f]*$/),
S.annotations({ arbitrary: () => (fc) => fc.hexaString().map((hex) => `0x${hex}`) }),
```

No shared regex here, so nothing looks duplicated in review — but `fc.hexaString()` emits lowercase hex and the `.map` prepends `0x`, so every draw satisfies the pattern _by construction_. The second flavor is the dangerous one: it survives the code review that would catch a copy-pasted regex.

### The rule

**Read the generator off the domain contract, not off the regex.** A generator derived from the pattern literal can only produce inputs the pattern accepts. A rejection property needs inputs the _contract_ forbids, with the contract stated independently of the literal being mutated.

Before — the only laws that existed, per schema (generated, tautological): the `[schema]` draw above.

After — a rejection property with a contract-derived generator:

```ts
// packages/hex-schema/src/prefixed-hex.schema.property.test.ts:5-13
const decode = S.decodeUnknownEither(PrefixedHex)

it.prop(
  '∀b_PrefixedHexPrefix_⊥',
  [fc.stringMatching(/^[0-9a-f]+$/)], // bare hex body, no 0x
  ([body]) => Either.isLeft(decode(body)), // must be refused
)
```

The generator states what the contract _is_ — "a hex body without its `0x` prefix" — and asserts refusal. Rewrite the regex however you like; the schema must still reject a prefix-less hex string.

### Two corollaries

1. **A generic "should reject bad input" law is impossible to generate.** Deciding what _should_ be rejected requires consulting the pattern — the same circularity. Input is only bad relative to the refinement, and the refinement is the thing under mutation. Rejection is therefore always hand-authored, per schema, from a contract stated independently of the literal.
2. **The score conceals the tautology rather than exposing it.** 55.95% with every pattern mutant surviving was not a coverage gap to be filled with more of the same laws. It was the score certifying a class of tests that notice nothing about the refinement.

## Why This Matters

The failure is not a missing test. It is a category of law that looks like verification and performs none — a property-shaped object whose inputs are pre-validated by the code it claims to check.

The repo's constitution asks for properties over examples because a property states what the system guarantees. A tautological law guarantees nothing: it cannot go red on a real bug in the thing it names. The harm the principle guards against — a green suite covering only the cases you imagined — is exactly what this suite was, in a more insidious form: green on every input the implementation permits, blind to everything it forbids.

Mutation-as-the-measure exists because a score is only as honest as the tests behind it, and the harm it names is a score certifying tests that notice nothing. That is precisely what a tautological law produces. It also sets a trap for whoever is chasing the gate: when survivors look unreachable, the tempting moves are lowering the threshold or narrowing the mutated set. Both are forbidden, because both certify a score that noticed nothing. The prescribed move — and the one that landed here — is to kill the survivor with a sharper property, one the mutant class can actually reach.

There is a third principle in play, and the case here is its mirror image. Behavior is supposed to live where the mutator can see it; the harm named is a bug hidden in a file nothing mutates. Here the pattern **is** mutated — the mutator sees it fine — but no test can observe the mutation, because every input reaching the law was already validated by the very pattern being tested. Unmutated file, or unobservable mutation: the same disease wearing the uniform of coverage.

### The taxonomy consequence

Rejection properties initially had no legal home in this repo, which is why the fix took a taxonomy change and not just new tests:

- `*.schema.test.ts` is forbidden outright (`packages/oxlint-plugins/test-placement/src/rules/path.config.ts`), because hand-written schema tests had only ever restated generated coverage.
- `<cell>.property.test.ts` was restricted to `.workflow` / `.policy` stems.
- The in-source `if (import.meta.vitest)` route needs a module-level non-exported binding, which `prefixed-hex.schema.ts` and `uint8array-from-prefixed-hex.schema.ts` do not have — they are pure pipes with no local helper to pin.

The resolution: `.schema` joined `PROPERTY_CELLS` (`path.config.ts:30`) — not a new suffix, the existing `<cell>.property.test.ts` scheme — and the original ban kept its teeth through a new lint rule, `no-schema-law-duplicate` in `packages/oxlint-plugins/effect-schema`, which fails the build if a `*.schema.property.test.ts` calls `ruleOfSchemas`, `Schema.equivalence`, or `Schema.encodedSchema`. That door is deliberately narrow: the file earns its place by stating a refusal, or it does not exist. The `architect-schema` agent skill carries the same mandate as gate item 7.

## When to Apply

Reach for rejection properties when **all** of these hold:

- A schema carries a refinement — `S.pattern(...)`, a transform, a brand — constraining what it accepts.
- The schema has (or would get) generated `ruleOfSchemas` laws, so round-trip and encode-stability are already asserted.
- The refinement's mutants survive a real mutation run while the round-trip laws stay green.

That conjunction is the tell: **refinement mutants surviving while round-trip laws stay green.** It is the fingerprint of the tautology, not of thin coverage. If the round-trip laws die alongside the mutant, they are doing their job and the fix is elsewhere. If the refinement mutants die on their own, the arbitrary was already contract-derived and the schema is healthy. Only the combination indicts the generator.

This is also the correct response to any gate that will not close: do not lower the gate, do not narrow the mutated set. Sharpen the property. The survivors are a map of what the laws cannot see, and each one names a contract clause with no refusal stated about it.

## Examples

Four landed rejection properties, quoted from the tree. In each, the generator comes from the domain contract, never the pattern literal.

### 1. `PrefixedHex` — prefix, case, and alphabet refusals

The schema requires `0x` and refuses uppercase (`prefixed-hex.schema.ts:7`) — unlike `HexString`, it does **not** accept `[A-F]`:

```ts
// packages/hex-schema/src/prefixed-hex.schema.property.test.ts:7-25
const hexBody = fc.stringMatching(/^[0-9a-f]*$/)

it.prop('∀b_PrefixedHexPrefix_⊥', [fc.stringMatching(/^[0-9a-f]+$/)], ([body]) => Either.isLeft(decode(body)))

it.prop('∀b_PrefixedHexCase_⊥', [fc.stringMatching(/^[A-F]+$/)], ([upper]) => Either.isLeft(decode(`0x${upper}`)))

it.prop(
  '∀b_PrefixedHexAlphabet_⊥',
  [fc.tuple(hexBody, fc.constantFrom('g', 'z', '!', ' ', '-'), hexBody)],
  ([[head, outsider, tail]]) => Either.isLeft(decode(`0x${head}${outsider}${tail}`)),
)
```

The outsider alphabet deliberately excludes `x`, which would form a legal prefix. Result: every `S.pattern` mutant in `prefixed-hex.schema.ts` now dies (2 Killed + 2 Timeout).

### 2. `Uint8ArrayFromPrefixedHex` — byte alignment, the strongest case in the set

The schema encodes bytes (`uint8array-from-prefixed-hex.schema.ts:7`) and its arbitrary maps real `Uint8Array`s to hex. Every generated value therefore has an **even-length body by construction** — the round-trip is not merely silent on alignment, it is structurally incapable of producing a misaligned input:

```ts
// packages/hex-schema/src/uint8array-from-prefixed-hex.schema.property.test.ts:7-14
const bytePairs = fc.stringMatching(/^(?:[0-9a-f]{2})*$/)
const nibble = fc.stringMatching(/^[0-9a-f]$/)

it.prop(
  '∀b_ByteAlignment_⊥',
  [fc.tuple(bytePairs, nibble)],
  ([[pairs, odd]]) => Either.isLeft(decode(`0x${pairs}${odd}`)),
)
```

`pair* + single` forces odd length on every draw — not merely makes it likely. This property pins a domain law ("hex encodes bytes") that no round-trip, encode-stability, or `Schema.equivalence` assertion can reach. Result: 3 Killed; 2 survivors remain, logged below.

### 3. `ColonHex` — three-nibble group refusal, in-source

`ColonHex` groups into one-or-two-digit groups (`colon-hex.schema.ts:11`) with arbitrary `fc.hexaString().map(hexToColon)`, so widening `{1,2}` to `{1,3}` survives every generated law:

```ts
// packages/hex-schema/src/colon-hex.schema.ts:66-72
const decodeColonHex = S.decodeUnknownEither(ColonHex)

it.prop(
  '∀g_ColonHexTripleGroup_⊥',
  [fc.stringMatching(/^[0-9A-Fa-f]{3}$/)],
  ([group]) => Either.isLeft(decodeColonHex(group)),
)
```

The same block carries a transform-pinning law that catches a `hexToColon` `.toUpperCase()` deletion — the function sits on **both** sides of the round-trip, so the bug cancels itself out and both generated laws stay green. Result: all 8 `S.pattern` mutants in `colon-hex.schema.ts` flipped Survived → Killed.

### 4. `HexString` — alphabet refusal, in-source

```ts
// packages/hex-schema/src/hex-string.schema.ts:66-73
const decodeHexString = S.decodeUnknownEither(HexString)
const hexPart = fc.stringMatching(/^[0-9a-fA-F]*$/)

it.prop(
  '∀s_HexStringAlphabet_⊥',
  [fc.tuple(hexPart, fc.constantFrom('g', 'z', '!', ' ', '-'), hexPart)],
  ([[head, outsider, tail]]) => Either.isLeft(decodeHexString(`${head}${outsider}${tail}`)),
)
```

Result: 3 Killed + 2 Timeout in `hex-string.schema.ts`, and 4 Timeouts in `strict-hex.schema.ts` through composition — that file has no property test of its own.

### The measured arc

| Step                                                        | Package score | Notes                                                                                     |
| ----------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| Stryker gate lands (`cca5f66e8e`)                           | 55.95%        | every `S.pattern` mutant Survived                                                         |
| + colon-hex / hex-string refusals, in-source (`b5cf2e1d23`) | 57.14%        | colon-hex 8 Killed; hex-string 3 Killed + 2 Timeout; strict-hex 4 Timeout via composition |
| + prefixed-hex / uint8array refusal files (`be5400c6b3`)    | 69.05%        | prefixed-hex 2 Killed + 2 Timeout; uint8array 3 Killed                                    |

The generated-laws rewrite (`17743ad3f9`) and the schema-plugin split (`317f9e3ae0`) are the prerequisites that made authored refusal tests a sanctioned, lint-guarded category.

> **On the SHAs above:** all five were local commits on `main` when this was written — reachable from `HEAD`, ten commits ahead of `origin/main`, none of them pushed. This repo lands work by fast-forwarding `main` rather than through squash-merged PRs, so there is no PR number to cite instead and the SHAs should survive the push unchanged. If they do not resolve for you, the branch was rewritten after the fact; search the commit subjects quoted here instead.

## Still Open

- **~21 declaration-data survivors.** `S.annotations({ identifier, description, title })` and `S.brand(...)` across `hex-schema` survive because they are declaration data, not behavior. The fix is a second rule in the `effect-schema-declarations` Stryker ignorer — a mutator-scope change, not a test.
- **2 `S.pattern` mutants in `uint8array-from-prefixed-hex.schema.ts`.** The prefix/case/alignment refusals killed 3; two remain unreached by any landed property.
- **`strict: true` transform-option booleans** in the `S.transform` calls are killed by nothing.
- **The `/.{1,2}/g` grouping in `hexToColon`** is behavior the transform-pinning law does not fully pin.

## Related

- [Workflow error-channel gates](../architecture-patterns/workflow-error-channel-gates.md) — the sibling mutation-blindspot lesson: a workflow that swallows `Either.left` produces a test the mutator cannot fail, the same shape of unfalsifiable green.
- [A guard that silently bypasses enforces nothing](../integration-issues/comment-checker-hook-silently-bypasses-on-patch-mode-edit.md) — the operational sibling: a skip indistinguishable from a pass.
- **Rationale repaired downstream:** `packages/oxlint-plugins/test-placement/AGENTS.md` rule TP4 used to justify the `*.schema.test.ts` ban by claiming the generated pair "already covers every exported schema" — false in the rejection dimension. TP4 now states the tautology as the reason and names `<name>.schema.property.test.ts` as the home for the uncovered half; the rule's user-facing lint message says the same. The ban itself never changed.
