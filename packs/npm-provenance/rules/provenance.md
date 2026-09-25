# A public package opts into provenance

A `package.json` without `"private": true` must set
`"publishConfig": { "provenance": true }`.

npm generates provenance automatically only when `npm publish` itself runs under
trusted publishing. Tools that publish through their own command (pnpm,
changesets, release scripts) read the setting from `publishConfig`, so without it
the package ships with no attestation linking it to its source and build.

Fix it by adding `"provenance": true` to the package's `publishConfig`.

```grit
language json
multifile {
  file($name, $body) where {
    $name <: r".*package\.json",
    $program <: not contains `"private": true`,
    $program <: contains `"name": $_`,
    $program <: or {
      not contains `"publishConfig": $_`,
      contains `"publishConfig": $publish` where {
        $publish <: not contains `"provenance": true`
      }
    }
  }
}
```
