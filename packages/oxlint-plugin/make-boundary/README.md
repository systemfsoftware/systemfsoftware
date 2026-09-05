# @systemfsoftware/oxlint-make-boundary

The `Workflow.make` boundary locator for oxlint rules: every `Workflow.make(...)` call in a file, its resolved decision body, and containment queries — shadow-correct, alias-correct, built on `@systemfsoftware/oxlint-import-origin` (bundled in at build time).

Not a plugin. One module (`MakeBoundary.ts`), consumed at build time by the plugins that judge decision bodies: `oxlint-plugin-effect-workflow` and `oxlint-plugin-structure` (`no-domain-branching-density`). Declared as a devDependency and bundled into each consumer's dist, so published plugins stay standalone with no inter-plugin dependency.

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/oxlint-plugin/make-boundary#readme).
