# A workspace manifest declares its surface in `exports`, with no wildcard and no untyped entry

Every published specifier of a workspace package lives in its `exports` map. A
manifest with a top-level `main`, `module` or `types` and no `exports` publishes
one resolution that no subpath can address; a wildcard subpath key (`*`)
exposes whatever the build happens to emit as public surface; a code entry
object with a `default` or `import` branch but no `types` branch ships an untyped
specifier. An entry whose target ends `.json` is a data asset, not a code entry,
so it needs no `types`; a package marked `"private": true` is exempt. Next: put
every importable specifier under `exports`, replace a wildcard with the concrete
subpaths it stands for, add a `"types"` branch to every code entry object, and
drop the top-level `main`/`module`/`types` fields the manifest no longer needs.

```grit
language json
multifile {
  file($name, $body) where {
    $name <: r"(?:.*/)?package\.json",
    $program <: contains `"name": $_`,
    $program <: not contains `"private": true`,
    or {
      and {
        $program <: not contains `"exports": $_`,
        $program <: contains or { `"main": $_`, `"module": $_`, `"types": $_` }
      },
      $program <: contains `"exports": $exports` where {
        $exports <: contains `$subpath: $_` where { $subpath <: includes "*" }
      },
      $program <: contains `"exports": $exports` where {
        $exports <: contains `$subpath: $default_entry` where {
          $default_entry <: contains `"default": $default_target`,
          $default_entry <: not contains `"types": $_`,
          $default_target <: not r"\".*\.json\""
        }
      },
      $program <: contains `"exports": $exports` where {
        $exports <: contains `$subpath: $import_entry` where {
          $import_entry <: contains `"import": $import_target`,
          $import_entry <: not contains `"types": $_`,
          $import_target <: not r"\".*\.json\""
        }
      }
    }
  }
}
```

## Why

`exports` is the only list Node consults for a package's specifiers: a
top-level `main` or `types` is unreachable beside a map, and a wildcard subpath
publishes every file under a directory as a supported specifier, so a rename
becomes a breaking change nothing declares. A `default` or `import` branch
without `types` resolves an untyped file, the `arethetypeswrong` finding
`packs/source-resolution` also rules on; the order of keys inside an entry is
`source-resolution/export-map-order`'s concern, and the shape of the map is this
rule's.

**One finding per manifest.** The rule is multifile so gritlint parses only
`package.json` files; a multifile match is reported against the first file of
its directory batch, which for this rule is the manifest itself, so the message
names the manifest's directory.
