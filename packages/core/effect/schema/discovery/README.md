# @systemfsoftware/effect-schema-discovery

Shared Effect Schema source-discovery walk used by the Vite law and refutation plugins.

Two Vite plugins walk the same directory for the same declarations — `@systemfsoftware/effect-schema-vite` and `@systemfsoftware/effect-schema-refutation-vite`. Both need to find every exported `Schema` in a consumer's `src/`: one to inject `ruleOfSchemas` round-trip laws, the other to inject obligation-coverage assertions. A published package cannot import a sibling's internals, so the shared walk lives here as a plain dependency both plugins depend on. A consumer never installs this package directly; it is installed transitively through the plugins.

## Entry points

- `@systemfsoftware/effect-schema-discovery`

## API

The public surface is generated from the source and versioned with the package: [`etc/effect-schema-discovery.api.md`](./etc/effect-schema-discovery.api.md).

Exports `FoundSchema`, `findExportedSchemas`, `quote`, `identityOf`, `findRefutedIdentities`. The AST predicates (`findExportedSchemaNames`, `typeRefContainsSchema`, `isSchemaUseCall`, `memberChainStartsWithS`, `extendsSchemaClass`) and refutes helpers (`isRecord`, `identifierName`, `findRefutesCallSites`, `resolveLocalModule`, `importedBindings`) are interior and not exported.

## License

Apache-2.0. Part of [systemfsoftware](https://github.com/systemfsoftware/systemfsoftware/tree/main/packages/core/effect/schema/discovery#readme).
