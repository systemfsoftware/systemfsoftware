# typecheck build mode: a reference-only root must be built

A reference-only `tsconfig.json` root (`files: []` plus `references`) typechecks
nothing by itself, so its sibling `package.json` `typecheck` script must run
`tsc -b` or `tsc --build` to reach the referenced projects.

Any other `tsc` invocation — `tsc --noEmit`, `tsc --noEmit --incremental`,
`tsc -p tsconfig.test.json` — exits 0 on a tree that does not compile, because a
solution-style root owns no file and a non-build `tsc` never follows its
references. The gate reports a clean typecheck on a broken tree, and the errors
only surface when a consumer's build reaches the referenced project.

Fix it by making the root's `typecheck` script `tsc -b` (or `tsc --build`), which
reaches the referenced projects and reports their errors.

```grit
language json
multifile {
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)tsconfig\.json"($dir),
    $program <: contains `"files": []`,
    $program <: contains `"references": [$reference, $...]`
  },
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)package\.json"($manifest_dir),
    $manifest_dir <: $dir,
    $program <: or {
      not contains `"typecheck": $_`,
      contains `"typecheck": $script` where {
        $script <: not includes "tsc -b",
        $script <: not includes "tsc --build"
      }
    }
  }
}
```
