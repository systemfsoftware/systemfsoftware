# @systemfsoftware/oxlint-import-origin

The import-origin resolver for oxlint rules: given an ESTree node and a scope-lookup closure, answer "what module and exported name does this reference ultimately denote?" — shadow-correct through aliases, destructures, computed member keys, `.bind`/`.call`/`.apply` forwarding, and TS wrappers.

Not a plugin. One module (`ImportOrigin.ts`), consumed at build time by the rule plugins that gate on import origin (`oxlint-plugin-effect-workflow`, `oxlint-plugin-effect-schema`, `oxlint-plugin-structure` via `oxlint-make-boundary`). It is a devDependency of each consumer and is bundled into their dist, so published plugins stay standalone with no inter-plugin dependency.

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/oxlint-plugin/import-origin#readme).
