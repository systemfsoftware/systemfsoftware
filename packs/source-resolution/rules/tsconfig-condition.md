# tsconfig project: name the source condition, or extend a config that does

Every `tsconfig*.json` with a non-empty `include` compiles files, and every file
it compiles that imports a workspace package by its published name must resolve
that name to source. So the project must name the development source condition in
`customConditions` itself, extend one of the configured presets that carries it,
or extend another project in the same package, which this same rule checks.

A project that does none of these resolves the published name through `types` to
`dist/`. On a clean checkout that directory does not exist, so type-aware lint
reports `error type` findings on every workspace import and `tsc` reports TS2307
— the failure that only shows up once the artifact is gone.

Fix it by listing the condition in `customConditions` of the project that
compiles the importing file, or by extending the preset that already carries it.
A solution-style root (`files: []` plus `references`) owns no file and needs
nothing here, and a project that extends a sibling project inherits the sibling's
options — so the sibling must name the condition.

```grit
language json
multifile {
  file($name, $body) where {
    $name <: r".*/tsconfig[^/]*\.json",
    $program <: contains `"include": [$first, $...]`,
    $program <: not contains `"extends": $extends` where {
      $extends <: or { presets(), contains presets(), includes "./" }
    },
    $program <: not contains `"customConditions": [$cond, $...]` where {
      $cond <: condition()
    }
  }
}
```
