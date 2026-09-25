# npm-provenance

Rules for publishing public packages to npm with trusted publishing (OIDC) and
provenance. A package counts as public when its `package.json` has a `name` and
no `"private": true`.

| Rule             | Requires                                                             |
| ---------------- | -------------------------------------------------------------------- |
| `repository-url` | `repository.url` equals the repository the package is published from |
| `public-access`  | a scoped package sets `publishConfig.access` to `"public"`           |
| `provenance`     | `publishConfig.provenance` is `true`                                 |

## Parameters

- `repositoryUrl`: a GritQL pattern for the `repository.url` string node, for
  example `` `"git+https://github.com/acme/widgets.git"` `` for an exact match.

```json
{
  "packs": {
    "npm-provenance": { "repositoryUrl": "`\"git+https://github.com/acme/widgets.git\"`" }
  }
}
```

List fixture and test-resource trees that hold deliberate non-publishable
`package.json` files under `ignore`.
