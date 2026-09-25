# A public package names the repository it is published from

A `package.json` without `"private": true` must declare `repository.url`, and the
URL must be the repository the package is published from.

npm signs provenance with the repository that ran the publish, and the registry
rejects the provenance bundle when `repository.url` is missing or does not match
it exactly (case-sensitive). With trusted publishing (OIDC) provenance is on by
default, so the publish itself fails.

Fix it by declaring `"repository": { "type": "git", "url": "<the repository URL>" }`
with the URL this pack's `repositoryUrl` parameter names. In a monorepo also set
`"directory"` to the package's path.

```grit
language json
multifile {
  file($name, $body) where {
    $name <: r".*package\.json",
    $program <: not contains `"private": true`,
    $program <: contains `"name": $_`,
    $program <: or {
      not contains `"repository": $_`,
      contains `"repository": $repository` where {
        $repository <: or {
          not contains `"url": $_`,
          contains `"url": $url` where { $url <: not repositoryUrl() }
        }
      }
    }
  }
}
```
