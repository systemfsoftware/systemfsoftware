# typecheck-build-mode

One rule: a reference-only `tsconfig.json` root (`files: []` plus `references`)
typechecks nothing by itself, so the sibling `package.json` `typecheck` script
must run `tsc -b` or `tsc --build` to reach the referenced projects. It replaces
`scripts/guards/check-typecheck-build-mode.ts`.

Any other `tsc` invocation — `tsc --noEmit`, `tsc --noEmit --incremental`,
`tsc -p tsconfig.test.json`, or no script at all — exits 0 on a tree that does
not compile, because a solution-style root owns no file and a non-build `tsc`
never follows its references. The gate then reports a clean typecheck on a broken
tree, and the errors surface only when a consumer's build reaches the referenced
project.

## Enable it

```json
{
  "packs": {
    "typecheck-build-mode": {}
  }
}
```

No parameters: the pack compares two files in one package directory, both JSON,
so no configuration has to name anything.
