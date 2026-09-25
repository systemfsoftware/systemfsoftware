# Internals package: keep the source condition out of its export map

A package with a bundler config (`tsdown.config.ts`) is consumer-safe and exposes
source under the condition; a package without one is internals, and its export
map must carry no source condition — its `exports` stay `types`/`default` to
`dist/`.

A source condition on an internals package makes workspace consumers resolve
that package's source, which they cannot model (the sibling typecheck reports
internals, arethetypeswrong reports a bridge problem). The published name then
degrades to an error type during development instead of resolving the built
artifact the package is meant to expose.

Fix it by removing the condition from the internals package's export map,
declaring `devExports` nowhere, and adding this package's own build to lint's
`dependsOn` so its `dist/` is present.

```grit
language json
multifile {
  bubble($dir, $tsdown) file($name, $body) where {
    if ($name <: r"(.*/)tsdown\.config\.ts"($dir)) {
      $tsdown = $filename
    } else {
      true
    }
  },
  bubble($dir, $tsdown) file($name, $body) where {
    $name <: r"(.*/)package\.json"($dir),
    $program <: contains `"exports": $exports` where {
      $exports <: contains `$subpath: { $cond: $_, "types": $_, "default": $_ }` where {
        $cond <: condition()
      }
    },
    $tsdown <: undefined
  }
}
```
