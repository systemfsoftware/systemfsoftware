# Choosing a regex parser for the Regex mutator

## The decision

`@eslint-community/regexpp`, with span splicing. Replaces `weapon-regex@1.3.2`.

## Why a decision was needed

`weapon-regex` is a Scala library compiled to JavaScript. The whole dependency
was reached through one call — `mutate(pattern, flags, { mutationLevels: [1] })` —
and it carried a compiled blob no reader of this repository can audit. That is
the shape of supply-chain exposure worth removing: a large opaque artifact,
published by a project that has stopped moving, reached by a single call.

The capability stays. Regex mutation is real mutation testing; only the
dependency changes.

## Candidates

| candidate                               | unpacked     | transitive deps | printer                  | maintenance                                                                                                  |
| --------------------------------------- | ------------ | --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `@eslint-community/regexpp` 4.12.2      | 474 kB       | **0**           | none — splice node spans | last commit 2025-10-23; shipped by `eslint` 10.1.0 and `@typescript-eslint/eslint-plugin`                    |
| `regjsparser` 0.13.2 + `regjsgen` 0.8.0 | 73.6 + 15 kB | 1 (`jsesc`)     | `generate(ast)`          | parser active (2026-06-13), consumed by Babel's `regexpu-core`                                               |
| `regexp-tree` 0.1.27                    | 313.7 kB     | 0               | `generate(ast)`          | last release 2023-04-30, 52 open issues, no `v`-flag support                                                 |
| `oxc` regex crate                       | —            | —               | —                        | Rust only; the napi surface exposes a regex literal as `{ pattern, flags }` strings, with no traversable AST |

## Deciding criterion

**Transitive dependency count, given that both live candidates are alive.**

We are removing a dependency because it rotted, so maintenance is the first
filter — and it eliminates only `regexp-tree` (three years stale, and it cannot
parse `v`-flag set notation at all). `oxc` fails a different way: it is Rust-only,
so adopting it means authoring and maintaining a napi binding, which is more
surface than the dependency it would replace, not less.

Between the two survivors, `regexpp` wins on dependency count: zero versus two
packages and one transitive. Its institutional backstop is also the stronger of
the two — it cannot rot without breaking ESLint itself.

## Why the missing printer is not a cost here

`regexpp` has no generator, which is the one real argument for `regjsparser`. It
does not apply to this use, because each of the seven mutations changes exactly
one node and produces exactly one mutant:

| mutation                  | edit                                                |
| ------------------------- | --------------------------------------------------- |
| anchor removal            | delete the `^` or `$` span                          |
| lookaround negation       | one character, `=` to `!`                           |
| character class negation  | insert or delete `^` after `[`                      |
| predefined class negation | toggle the case of one letter                       |
| unicode property negation | toggle `p` to `P`                                   |
| quantifier removal        | replace the quantifier span with its element's text |

Every one is a single splice into the _original_ pattern, so nothing is ever
re-printed and no offset bookkeeping arises — that only appears when several
edits land in one string, which never happens here. The nodes carry `start`,
`end` and `raw`, which is all a splice needs.

Taking `regjsparser` for its printer would also import a live problem:
`regjsgen@0.8.0` states compatibility with `regjsparser` **0.12**'s AST while the
parser has moved to 0.13, and Babel's response was to fork the printer as
`@babel/regjsgen`. Paying two packages for a component we would not call, whose
pairing upstream does not trust, is a bad trade.

## What would reverse this

`regexpp` going quiet while `regjsparser` stays active would flip the
maintenance filter. It is a single-maintainer fork plus a release bot; ESLint's
dependency is what keeps it honest, so ESLint dropping it is the signal to watch.
The swap is cheap to reverse: the parser is reached from one module, behind a
pure function whose behaviour is pinned by a recorded corpus.

## How behaviour is held

The mutator's complete output — 59 patterns, 90 replacements, in emission order —
was recorded from `weapon-regex` before any change and asserted through the
engine's public surface. The rows expecting nothing carry most of the weight:
alternation, grouping, backreferences and bare anchors are deliberately not
mutated, and an eager replacement fails there first.

The confirmed level-1 set, read from `weapon-regex` v1.3.2 sources, is exactly:
`BOLRemoval`, `EOLRemoval`, `LookaroundNegation`, `CharClassNegation`,
`PredefCharClassNegation`, `UnicodeCharClassNegation`, `QuantifierRemoval`.
Everything else in that library belongs to levels 2 and 3 and was never reached.
