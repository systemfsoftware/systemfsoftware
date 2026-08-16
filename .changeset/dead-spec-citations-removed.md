---
"@systemfsoftware/oxlint-plugin-effect-workflow": patch
"@systemfsoftware/oxlint-plugin-recommended": patch
---

Remove citations to specs that do not exist

Each leaf cited a `skill://architect-<cell>` spec, an id minted inside one, or a gate
this repo no longer carries. None of those resolve — no `architect-*` skill exists, and
the ids lived in an operator-layer file that could never ship with the clone.

Two `meta.docs.description` strings in `effect-middleware` are the consumer-visible half
of this: they ended in a parenthetical naming a spec the consumer cannot read. Each
sentence already stated its constraint in full, so the citation was the only part removed.

Where a citation carried content — which constraints a package deliberately leaves to
review, and why each is out of mechanical reach — the constraint is now named in place
instead of pointed at.
