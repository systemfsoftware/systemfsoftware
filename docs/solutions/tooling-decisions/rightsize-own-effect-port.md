# Own Effect port of rightsize-node replacing testcontainers repo-wide

> Category: tooling-decision · Recorded: 2026-08-16 · Status: landed

## The decision

Fork `rightsize-node` and rebuild it completely as an owned workspace
package, `@systemfsoftware/rightsize`, and replace every `testcontainers`
usage in the workspace with it. The upstream repository is behavioral spec
only; its internal structure was not copied (the port plan,
`docs/plans/2026-08-16-001-feat-rightsize-effect-port-plan.md`, records the
architecture derivation).

## Why this is costly to reverse

Every contract lane in the workspace would depend on the new package's
surface, its error taxonomy, and its discovery semantics. Switching back, or
to another library, means re-migrating every lane and re-proving parity —
the exact work this decision performs once.

## The candidates that lost

1. **Keep `testcontainers`.** Lost on three counts, each observed in this
   workspace: its client dials `docker.sock` only, so a podman-only host
   (this repo's own CI reality) fails the lane at connect — the recorded
   dead-socket failure; its API is Promise-shaped, so every Effect lane pays
   a runPromise bridge at the exact edge where interruption and typed errors
   matter most; and its surface is human-test-shaped, with no durable
   cross-process handle an agent can carry between tool calls.
2. **Depend on the `rightsize-node` npm package.** Lost on ownership and
   integration: the published package is not Effect-native (side-effect
   backend registration, throwing constructors, a mutable god-builder), and
   depending on it would make an agent-facing load-bearing surface
   third-party-governed — exactly what the workspace's ownership rule
   exists to prevent.
3. **Fork-and-rebuild (chosen).** The behavioral spec is small and
   port-complete (a parity matrix enumerates the installed incumbent's
   entire public type surface — 213 members, every one present or
   superseded with a documented Effect-native replacement), the workspace
   already owns every Effect idiom the rebuild needs, and ownership makes
   the agent-native additions (durable handles, deterministic reap, typed
   diagnostics) first-class rather than veneer.

## The deciding criterion

A single library must serve both human contract lanes and agent sessions.
That requires: decisions as pure values at the `Workflow.make` boundary
(the workspace's sandwich doctrine), typed errors on every channel, runtime
discovery that probes rather than assumes the socket, and a durable
container handle that survives process boundaries. No candidate but the
rebuild offers all four; the incumbent offers none of the four.

## The reversing observation

If upstream ships a must-have, cherry-pick from it by path — upstream is
read-only reference, and the parity matrix (regenerate with
`parity:write`, drift-gated inside `build` via `parity:check`) is the
contract that makes any behavioral divergence visible as a named gate
failure rather than a silent lane regression. The frozen surface snapshot
(`parity-surface`) pins the incumbent's shape the matrix was proven
against, so a deliberate future re-comparison is one command, not
archaeology.

## What makes the port trustworthy

- The docker parity lane runs real containers against the pinned
  `layerDocker` backend and never skips on a missing runtime — a dead
  daemon is a red lane with a named error reciting every probed socket.
- Both migrated consumer lanes (mutation-CLI and types-audit CLI) run their
  existing scenario suites unchanged against the new library — behavior
  pins, not rewrites.
- Every decision cell carries property tests over schema-derived inputs;
  the taxonomy of test files was dismantled to three sanctioned shapes so
  the suite is laws, composition, and live behavior, nothing else.
