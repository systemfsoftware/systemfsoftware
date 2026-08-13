---
"@systemfsoftware/oxlint-plugin-effect-workflow": major
---

`workflow-declaration-form` now demands the constructor, and is registered for the first time.

The rule previously required a `Workflow<Command, Decision, Error>` type annotation. It now requires the
export to be produced by a call to `Workflow.make` from `@systemfsoftware/effect-cell-types`, and
reports three distinct cases: `missingMake` (no `make` call), `annotationInsteadOfMake` (the annotation
form, which cannot produce the `UninhabitedDecision` / `UninhabitedError` markers and so defeats the
constructor's guarantee on the same function), and `localTypeDeclaration` (a file carrying its own copy
of `type Workflow<…>` — two such hand-written copies were found in this workspace, neither of which any
rule had ever caught).

Breaking twice over, and deliberately so per `REPO-R1`:

- The rule was **registered nowhere** — absent from the plugin's `rules` map and from
  `configs.recommended`, so it had never run. It is now in both at `'error'`, which means consumers on
  `recommended` will see previously-passing `*.workflow.ts` files fail until they migrate to
  `Workflow.make`. That dependency edge is intentional: a package holds a workflow or it does not.
- The old message ids `functionDeclaration`, `missingAnnotation`, and `wrongAnnotation` are gone.

Also fixed: three rules — `workflow-command-object`, `workflow-schema-required`, and
`workflow-single-function-export` — shared a helper that recognised only an arrow or function-expression
initializer, so a `Workflow.make(…)` call read as **zero exported functions**. The first failed loudly;
the other two silently stopped checking and reported green. A shared `workflowFunctionInit` now sees
through one `.make` call so parameter and return-type inspection lands on the real decider.

No rule was retired. `workflow-either-inhabited`, `workflow-schema-required`, and `workflow-no-async`
each catch something the constructor does not: the `Uninhabited*` markers only bite at a call site, so
an exported-but-uncalled total workflow typechecks clean, and `workflow-no-async` checks the whole file
for async functions, `await`, and `Promise` references rather than only the decider's return type.
