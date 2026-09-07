# Identity brands and named claims in domain schemas

## Problem frame

`schema-bare-primitive-field` (registered in `@systemfsoftware/oxlint-plugin-effect-schema`, enrolled at `error` 2026-09-07) refused every field whose chain held no refinement. The migration census found 160 live violations. Three site classes had no honest _constraint_ to refine: free text where the empty string is legitimate (`failureMessage`, mutant `replacement`, embedded file `content`), genuine two-value flags (`quiet`, `disableBail`), and genuinely-any-value fields (`Config`'s module default export). Forcing a constraint there invents a lie; leaving them bare leaves the anemia hole open.

## Architectural invariants

1. **A schema field must carry one of exactly three claims.** A stock member whose name states the shape (`S.NonEmptyString`, `S.Int`, `S.Finite`, `S.Literals([...])`); a check refinement when no stock member states the constraint; or an identity brand naming the role (`S.String.pipe(S.brand('FailureMessage'))`). A bare primitive states nothing and is refused; an `annotate({identifier})`-only chain states nothing either — an identifier without a brand is still the bare type.
2. **A brand is a nominal claim, never a constraint claim.** `S.brand` keeps the base schema's decode, so `S.String.pipe(S.brand('X'))` verifies stringness and adds type-level distinction — value transposition dies at compile time, which is the harm CONST-D3 names. Constraint-sounding brand names ("PositiveInt") carry no runtime force; if a constraint is real, the check must exist in the chain regardless of the name.
3. **Zero-decode brands are forbidden.** `Brand.nominal()` is `input as A` — a cast in library clothing (verified in the vendored `repos/effect` `Brand.ts`), and `Brand.check()` with zero checks silently degrades to nominal. `schema-brand-requires-decode` fires on exactly those constructors; every decoded brand passes.
4. **Inline per-field validators are Zod-style and refused.** `S.String.pipe(S.check(S.isMinLength(1)))` re-implements `S.NonEmptyString` at every site — a copy-paste cluster with zero domain vocabulary (CONST-S4). Stock member first, refinement only when no stock member states the claim.
5. **State-encoding booleans become literal unions; plain toggles become branded booleans.** A boolean the domain branches on as states (`exitSuccess` driving Continue/Exhausted) is CONST-D4's state-in-disguise: name the states (`S.Literals(['succeeded','failed'])`). A configuration toggle that stays `true`/`false` on the wire gets `S.Boolean.pipe(S.brand('Quiet'))` — nominal, wire-preserving.

## Verification and smells

- Gates: both enrolled rules at `error` through the leaf `configs.recommended` -> `recommendedFrom` spread; RuleTester suites pin each claim form; the published-surface firing suite re-fires the corpus against the built dist.
- Smell: `S.check(S.is<...>)` wrapping a stock check — grep `\.check\(S\.is` and replace with the stock member.
- Smell: `Brand.nominal(` or `Brand.check()` with no arguments — banned, lint-enforced.
- Smell: `annotate({identifier})` with no `brand` and no refinement anywhere in the chain — banned, lint-enforced.
