---
"@systemfsoftware/oxlint-plugin-effect-workflow": major
"@systemfsoftware/oxlint-plugin": minor
"@systemfsoftware/oxlint-config": major
---

The core regime keys on the `Workflow.make` boundary; the complement gains a complexity ceiling.

- `workflow-match-exhaustive` no longer reads the filename: the gate is the make callee boundary
  (import binding + member `make` + argument containment, module-scope references followed,
  shadow-correct). Identical dispatch outside a make body produces no diagnostic.
- New `make-body-purity`: references inside make bodies resolve only to parameters, const locals,
  and audited-pure imports; control flow is banned with the one first-statement converging guard;
  unclassifiable references report honestly as unresolvable rather than passing. Test files are
  exempt — fixtures exercise decisions without the production regime binding them.
- New `no-domain-branching-density` in core: per-function McCabe CC outside make bodies, ceiling
  17 — the lowest measured value the tree passes with zero waivers (max measured 17; the 15
  functions over 10 are the recorded extraction backlog, not retrofit targets).
- Both make-boundary rules fix classifier defects their first workspace run exposed: builtin
  globals with empty defs take the named-global triage, and `as const` type subtrees leave the
  value-reference walk.
