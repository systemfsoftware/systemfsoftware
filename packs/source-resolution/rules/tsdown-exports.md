# tsdown config: a named source condition, the hook, and cleaning on

The bundler config must own both export maps: `exports.devExports` names the
development source condition as a **string**, `exports.customExports` names the
hook that injects `types` on every subpath, and `clean` must not be disabled.

`devExports: true` points the whole map at source with no condition key, so
`npm pack` would ship a map whose `default` resolves to a file the tarball does
not contain, and a consumer that does not read the condition gets source instead
of declarations. A missing `customExports` hook leaves the generated map without
`types`, which is the untyped-resolution finding. `clean: false` leaves build
output in `dist/` that no current entry emits — orphaned output that every gate
globbing the directory reads, so a renamed entry or dropped subpath keeps
resolving from a stale declaration file.

Fix it by declaring `exports: { devExports: '<scope>/source', customExports:
injectTypes }`, with `injectTypes` visiting every export key except
`./package.json` on both hook invocations, and by deleting any `clean: false`.

```grit
language js
multifile {
  file($name, $body) where {
    $name <: r".*/tsdown\.config\.ts",
    $program <: or {
      contains `exports: $exports` where {
        $exports <: `{ $first, $... }`,
        $exports <: or {
          not contains `customExports: $_`,
          not contains `devExports: $_`,
          contains `devExports: $value` where {
            $value <: not condition()
          }
        }
      },
      contains `clean: false`
    }
  }
}
```
