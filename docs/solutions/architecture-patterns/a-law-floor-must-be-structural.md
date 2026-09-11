# A Law Floor Must Be Structural — A Rebuilt Stock Twin Is Not Stock

Decision: when a generated law needs a "good enough" floor for a numeric
property (a deep-value share, a reachability count), the floor must be
computable from the schema's own declared policy or from structural constants
— never from a share measured on one balanced fixture, and never from a
rebuilt comparison object that shares closures with the annotated subject.

## The two shapes that failed

**Fixture-measured absolute floor.** The reference fixture (two base members,
two recur members, ceiling 6, `'medium'` decay) measured a deep-value share of
0.249 at depth ≥ 4; the stock-equivalent policy measured 0.000. Codifying
"15 %" as the law's floor encoded the fixture's arity balance, not the
policy's guarantee. The first real corpus union to run under the law — five
base members, two recur — cannot reach 15 % under any honest budget, because
`fc.oneof`'s depth decay biases toward the _first_ arbitrary (the base
members) as depth grows. A floor that a correct implementation fails is not a
floor; it is a fixture alias.

**The rebuilt stock twin.** The obvious repair — compare the annotated
derivation against `S.Union(the same members)` as a "stock twin" — is worse
than it looks. The recur members are `S.suspend(() => S.Struct({ …:
unionBinding }))`, and the closure binds the _annotated_ union. The twin's
members therefore generate through the declared hook, the twin and the subject
sample the same distribution, and the strict per-seed comparison degenerates
into a coin flip: deterministic-looking red on dry seeds, green on lucky ones.
Rebuilding the twin from the AST cannot fix this — the closures bind schema
values, not ASTs, so no generic rewrite can point them at the twin.

## What survived

The shipped law (`recursionLaws`) asserts, per seed:

1. the declared-budget sample contains at least one value at depth ≥ 4
   (`deepShareOf(sample) > 0`, emitted as `∀s_<label>DeepShare_≠Zero` over
   `DEEP_DEPTH`, which is `STOCK_MAX_DEPTH + 2`) — a collapsed annotation
   derives only the base members and never crosses the depth, so this holds a
   verdict of _no_;
2. the annotation declares a ceiling strictly above the stock constant
   (`maxDepth > STOCK_MAX_DEPTH`, the constant being `2`) — an annotation that
   mirrors stock is vacuous, and the deep-share law above is emitted only where
   the ceiling clears the constant;
3. the declared sample covers every declared variant
   (`coversEveryVariant(sample, members)`, emitted as
   `∀s_<label>Variants_⊇Declared`) — a sample that starves a member is a
   verdict of _no_;

and the termination law (`∀x_<label>Nesting_≤MaxDepth1`) caps every generated
value at `maxDepth + 1`. A pinned pair grounds both edges: a collapsed-hook
fixture whose measured share is exactly zero, and a base-heavy fixture (five
terminal members) whose declared budget does surface deep values. Because the
corpus unions are base-heavy, their migration picks `'small'` decay — the
`'medium'` default biases toward base at depth and starves the deep tail that
law 1 requires.

## The general shape

When a law needs a threshold, ask where the number lives:

- in the _declared policy_ (a ceiling read off the annotation) — safe;
- in a _structural constant_ (the stock cap, a depth the stock policy cannot
  reach) — safe;
- in _one fixture's measurement_ — it generalizes only to fixtures with the
  same arity balance, and the failure is silent until the first differently
  shaped real schema runs;
- in a _rebuilt comparison object_ — verify the rebuild shares no closure with
  the subject before trusting the comparison; closures bind values, and the
  values carry the annotation you were trying to strip.

Provenance: found while migrating the corpus's five-base/two-recur AST unions
under the recursion-budget plan (2026-09-11); the twin's coin-flip failure and
the 15 % floor's starvation both reproduced deterministically before the
structural formulation replaced them.
