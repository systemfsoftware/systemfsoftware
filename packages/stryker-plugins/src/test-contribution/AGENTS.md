# AGENTS.md — src/test-contribution/

> **Location:** `packages/stryker-plugins/src/test-contribution/` — the contribution gate.
> Universal agent rules live in the root `AGENTS.md`; this file carries only this directory's delta.

## Delta

This directory is **Locked**, not Editable, despite sitting under the Editable `packages/*/` glob. The
root Surface Classes table names it; this leaf exists because that table is easy to miss from inside a
package whose source is otherwise free to edit.

Locked means: read it, propose changes to it, but never edit it to make a verification pass. This code
decides whether a test file earns its place. An agent that can quietly widen the gate it is being judged
by is not being judged.

Legitimate reasons to change these files: a defect in the decision itself, a new failure mode the gate
should refuse, or a behaviour change the user asked for. Every one of those needs a scenario in
`__tests__/test-contribution/` that fails without the change.

Illegitimate: relaxing a threshold, adding a skip, or broadening an exemption because a package the gate
accuses is inconvenient to fix.
