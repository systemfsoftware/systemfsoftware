# api-extractor: point at a tsconfig that clears the source condition

When `api-extractor.json` exists, its `compiler.tsconfigFilePath` must name a
tsconfig that clears `customConditions` — the sibling `tsconfig.api.json` —
instead of the project that names the condition.

api-extractor resolves imports through that tsconfig, so a config that still
names the condition makes the extractor follow a sibling's `src/*.ts` and report
`ae-wrong-input-file-type` even when the sibling's `dist/` exists. Do not extend
a `files: []` solution-style root either: it carries no `compilerOptions`, so the
api tsconfig inherits no module mode and every import yields TS2307.

Fix it with a `tsconfig.api.json` that extends the project compiling `src` and
sets `compilerOptions.customConditions` to `[]`, and set
`compiler.tsconfigFilePath` to that file.

```grit
language json
multifile {
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)api-extractor\.json"($dir),
    $program <: contains `"tsconfigFilePath": $_`
  },
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)tsconfig\.api\.json"($api_dir),
    $api_dir <: $dir,
    $program <: not contains `"customConditions": []`
  }
}
```
