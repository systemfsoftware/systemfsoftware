# Export map: the source condition comes first, then dist types

Every object subpath of `exports` must list the development source condition
first, then `types` pointing into `dist/`, then `default`. tsdown generates this
map and the `customExports` hook orders it, so the order is the build tool's job.

A subpath whose first key is not the condition never resolves source during
development: a condition appended after `default` is unreachable, because
condition matching walks the entry in insertion order and takes the first match,
and `types` that point at `./src/` are not declarations. Tests and type-aware
lint then read built output a clean checkout does not have, and `types` missing
entirely leaves a tarball consumer with an untyped resolution (the
`arethetypeswrong` finding).

Fix it in the bundler config rather than in `package.json`: declare
`exports.devExports` as the condition _string_ and let the `customExports` hook
visit every export key except `./package.json`, inserting `types` before
`default`. A hand-edited map drifts the moment the build runs again.

```grit
language json
multifile {
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)tsdown\.config\.ts"($dir)
  },
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)package\.json"($package_dir),
    $package_dir <: $dir,
    $program <: contains `"exports": $exports` where {
      $exports <: or {
        contains `$subpath: { "types": $_, $cond: $_, "default": $_ }` where {
          $cond <: condition()
        },
        contains `$subpath: { $cond: $_, "default": $_, "types": $_ }` where {
          $cond <: condition()
        },
        contains `$subpath: { $cond: $_, "types": $target, "default": $_ }` where {
          $cond <: condition(),
          $target <: not includes "./dist/"
        },
        contains `$subpath: { $first: $_, $second: $_, "default": $_ }` where {
          $first <: not condition()
        },
        contains `$subpath: { "types": $_, $cond: $_ }` where {
          $cond <: condition()
        },
        contains `$subpath: { $cond: $_, "types": $_ }` where {
          $cond <: condition()
        },
        contains `$subpath: { $cond: $_, "default": $_ }` where {
          $cond <: condition()
        }
      }
    }
  }
}
```
