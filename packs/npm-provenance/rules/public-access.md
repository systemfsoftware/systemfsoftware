# A public scoped package declares public access

A `package.json` without `"private": true` whose name is scoped (`@scope/name`)
must set `"publishConfig": { "access": "public" }`.

npm publishes a scoped package as restricted unless told otherwise, and it refuses
to generate provenance for a new or restricted package ("Can't generate provenance
for new or private package, you must set `access` to public"). A publish that
depends on remembering `--access public` on the command line breaks the first
time someone runs it without the flag.

Fix it by adding `"access": "public"` to the package's `publishConfig`.

```grit
language json
multifile {
  file($name, $body) where {
    $name <: r".*package\.json",
    $program <: not contains `"private": true`,
    $program <: contains `"name": $_`,
    $program <: contains `"name": $package_name` where { $package_name <: r"\"@.*" },
    $program <: or {
      not contains `"publishConfig": $_`,
      contains `"publishConfig": $publish` where {
        $publish <: not contains `"access": "public"`
      }
    }
  }
}
```
