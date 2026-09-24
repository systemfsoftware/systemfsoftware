---
title: Duplicate Order Ids Masquerade as Version Conflicts When Row Keys Derive From Them
date: "2026-09-21"
module: systemfsoftware
problem_type: logic_error
component: example-inventory-fulfillment
severity: high
applies_when:
  - Deriving persistence primary keys from a client-supplied business id (orderId, userId)
  - Catching a generic transaction-rollback signal and mapping it to a single semantic failure
  - Adding idempotency or retry budgets around optimistic-concurrency writes
root_cause: design_gap
resolution_type: design_change
related_components:
  - ReservationLogDrizzle
  - fulfillment cell retry loop
  - RPC boundary validation
tags:
  - optimistic-concurrency
  - idempotency
  - error-attribution
  - cell-architecture
---

# Duplicate Order Ids Masquerade as Version Conflicts When Row Keys Derive From Them

## Problem

`audit_events.id` was `${orderId}:audit` and reservation rows `${orderId}:${lotId}`. A client that
honestly resubmits an already-fulfilled orderId collided on insert; the insert failure rolled the
transaction back, and the cell's single catch —
`Effect.catchTag('EffectTransactionRollbackError', () => Effect.succeed('VersionConflict'))` —
attributed that rollback to a lost stock race. The retry budget then walked the order into a
`ConflictRollback` the customer never earned, with inventory intact and no typed signal that the
real defect was a duplicate key. Three distinct causes (unique violation, business duplicate, CAS
miss) collapsed into one label.

## Mechanism

**Key derivation from client input converts duplicates into collisions.** A primary key is an
identity claim; a client-supplied business id is not unique across attempts. When the two are
identified, the database's uniqueness enforcement fires on the _second legitimate_ request, not on
corruption.

**A rollback catch is an error-attribution point, not a pass-through.** A transaction can roll back
for a schema constraint, a business rule, or the CAS's own deliberate `tx.rollback()`. Mapping every
`EffectTransactionRollbackError` to `'VersionConflict'` makes the CAS mechanism unfalsifiable: any
bug inside the transaction surfaces as a stock race. A catch this broad must at minimum distinguish
pg unique-violation (`23505`) from deliberate rollback before labeling.

**Idempotency rejection belongs at the boundary, before the cell.** The fix that holds: probe the
reservation log at the RPC handler (owner-scoped — own id → typed `DuplicateOrder`, foreign id →
`Forbidden`) _before_ invoking the cell. The cell's retry loop then only ever sees genuine stock
races. Guarding inside the cell would put an I/O probe in the pure pipeline and still misattribute
collisions from other writers.

## Failure Modes Prevented

1. **Retry-budget poisoning** — a bounded CAS budget (3 attempts) spent on a deterministic failure,
   ending in a rollback decision that names the wrong cause.
2. **Unfalsifiable conflict signal** — telemetry and tests reading `VersionConflict` cannot tell a
   stock race from a key collision, so the CAS seam cannot be trusted in isolation.
3. **Existence leak via idempotency probes** — an unscoped duplicate check would confirm foreign
   order ids exist; scope the probe by owner and answer `Forbidden` for foreign ids.

## Verification Patterns

- Integration scenario: resubmit the same orderId with the same session; assert the refusal decodes
  as the typed duplicate error and the original reservation count is unchanged (assert outcomes, not
  the internal conflict label).
- Grep gate: any `catchTag('EffectTransactionRollbackError', ...)` must map _distinct_ rollback
  causes to distinct outcomes, or document why the collapse is safe.

## Update 2026-09-24

The example no longer uses version checks or `ConflictRollback`. The whole order runs in one SERIALIZABLE transaction, and the store re-runs it only on SQLSTATE `40001` or `40P01`; every other failure, including a unique violation, surfaces as `StoreUnavailable` without a retry. The duplicate check moved _inside_ that transaction: `load` reads any existing reservation for the order id, and the cell refuses `DuplicateOrder` (owner) or `Forbidden` (anyone else). A check before the transaction opens is outside serialization and can go stale. The attribution lesson above still holds: only a real serialization failure may trigger a retry.

## Related

- `docs/solutions/tooling-decisions/effect-v4-unstable-stack-binding.md` (CAS seam, single-permit PGlite serialization)
- `compound-packs/cell-architecture/` (sandwich phase contract, shell-only conflict handling)
