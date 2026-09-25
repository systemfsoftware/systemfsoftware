# Published export map: dist-only, every entry an object

A consumer-safe package publishes `publishConfig.exports`, the map `pnpm pack`
writes over `exports`: every subpath is an object carrying `types` and `default`
and the development source condition is absent. Only `./package.json` may stay a
bare string.

A published subpath that carries the source condition ships a workspace-only
resolution to the registry, where no consumer has the source file. A subpath left
as a bare string is the untyped resolution `npm pack` would otherwise produce by
dropping the declarations `injectTypes` was supposed to add.

Fix it by making `customExports` handle the publish invocation too: tsdown calls
the hook twice (`isPublish: false` then `true`), and the publish invocation hands
it string entries that must become `{ types, default }`. Never hand-edit
`publishConfig.exports`.

```grit
language json
multifile {
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)tsdown\.config\.ts"($dir)
  },
  bubble($dir) file($name, $body) where {
    $name <: r"(.*/)package\.json"($package_dir),
    $package_dir <: $dir,
    or {
      $program <: not contains `"publishConfig": $_`,
      $program <: contains `"publishConfig": $publish` where {
        or {
          $publish <: not contains `"exports": $_`,
          $publish <: contains `"exports": $exports` where {
            $exports <: or {
              contains `$subpath: $entry` where {
                $subpath <: or { `"."`, includes "./" },
                $subpath <: not includes "./package.json",
                $entry <: `"$bare"`
              },
              contains `$subpath: $entry` where {
                $subpath <: or { `"."`, includes "./" },
                $entry <: contains `$cond: $_` where {
                  $cond <: condition()
                }
              }
            }
          }
        }
      }
    }
  }
}
```
