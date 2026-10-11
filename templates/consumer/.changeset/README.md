# Changesets

One change-intent file per change, read by `pnpm change` and configured in
[`release.jsonc`](../release.jsonc). Record one with:

```
pnpm change --bump <none|patch|minor|major> --summary "<changelog entry>" [<pkg>...]
```

- The frontmatter names each package and its bump, `"<pkg>": <none|patch|minor|major>`.
  The body is the changelog entry, published verbatim.
- A change to a package's turbo `build` inputs needs an intent here.
  `--bump none` records a change that needs no release.
- `pnpm change status` prints the pending intents and the release plan;
  `pnpm change check` validates them.
