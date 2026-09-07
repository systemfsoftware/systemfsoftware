# Enrollment requires a clean tree

## Problem frame

Promoting `schema-bare-primitive-field` to `error` with 160 live violations tempts a baseline: suppress the known sites, enroll, shrink later. That mechanism was built once this program — a JSON site list, an override object setting the rule to `off` per file, composed into a dozen package configs, plus a guard script failing on stale entries — and rejected whole. The ruling: suppression with extra steps is suppression.

## Failure modes

1. **Growth evasion.** A stale-detector cannot see added entries: an author who adds a new site to the list passes the guard while silencing a live violation. A baseline whose list can grow is keyed on the gated author's own data — CONST-E5's exact defect.
2. **Read-time suppression.** A per-package `rules: { rule: 'off' }` override is indistinguishable from suppression at every future read, regardless of the author's intent. Doctrine's dated-baseline precedent (the `NOT_YET_ENROLLED` allowlist in the base-registration self-consistency test) keeps the list _inside the gate that owns the assertion_, with entries that fail once their rule enrolls — the list can only shrink because the gate itself enforces it.
3. **Mechanism split.** Data file + override sites + guard script = three places for one invariant; the guard's guarantee does not compose with the override's effect.

## Architectural invariants

1. **Enrollment order: migrate, then enroll.** An evaluator rule lands (own commit), the tree migrates to it, and enrollment lands only when the live violation count is zero. Enrollment over a dirty tree manufactures a suppression mechanism.
2. **The only durable baseline is gate-resident and self-invalidating.** An allowlist entry naming a now-recommended rule fails the owning test; an entry naming no real rule fails too. Growth is prevented because the gate, not an auxiliary script, computes the verdict.
3. **Lint `extends` does not merge `overrides`.** A preset-level override block never reaches consuming packages; overrides compose only in each package's own config — relevant to anyone retrying a baseline shape.

## Verification

- Enrollment commits carry red-before evidence: a planted forbidden shape observed failing at `error` through the real preset chain, then removed.
- Paste-back test: re-adding any migrated forbidden shape fails the package lint — continuously enforced by the enrolled rule, not by a one-shot observation.
- Smell: a JSON/TS file listing files next to a rule name — that is a baseline; demand the migration or a gate-resident allowlist instead.
