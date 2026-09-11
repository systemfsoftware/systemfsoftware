---
"@systemfsoftware/effect-schema-recursion-budget": minor
"@systemfsoftware/effect-schema-extensions": none
"@systemfsoftware/effect-atom": none
"@systemfsoftware/effect-atom-react": none
"@systemfsoftware/effect-cell-types": none
"@systemfsoftware/effect-daemon-spec": none
"@systemfsoftware/effect-gherkin-spec": none
"@systemfsoftware/effect-memfs": none
"@systemfsoftware/npm-package": none
"@systemfsoftware/omp-typescript-discipline": none
---

A recursive schema declares its own generation budget as an annotation, and the package's Vite plugin materializes that declaration into the generation hook that honors it:

```ts
export const Expr = S.suspend((): S.Schema<Expr> => S.Union([Lit, Wrap])).annotate({
  recursionBudget: { maxDepth: 6, depthSize: 'medium' },
})
```

The plugin derives one depth identifier per annotated recursion point, so two cycles never share a budget, and a hand-written derivation in the same annotation is left untouched. A malformed budget refuses the module when it loads.

If you used `@systemfsoftware/effect-schema-bounded-union`, there is nothing to install: write the recursion point as one `Schema.suspend` whose union lists those members, with the budget declared on it.
