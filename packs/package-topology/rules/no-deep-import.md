# No module imports or re-exports another package's internals

An `import`, an `export ... from`, or a dynamic `import()` may name another
package's root (`dep`), a subpath that package declares (`dep/config`), or
`dep/package.json`. It reaches past the published surface when the first subpath
segment is `src`, `dist`, `lib`, `internal` or `build`, or when the specifier
ends `.ts`/`.mts`: those resolve against build internals the package's `exports`
map does not publish, and a version bump may move or rename them. A relative
specifier is not this rule's concern — a relative path that escapes the project
is a TypeScript composite project's own error. Next: import the package's root
or a subpath it declares; if the module is meant to be public, add it to that
package's `exports` and import the declared subpath.

```grit
language js
or {
  contains import_statement() as $statement where {
    $statement <: r"import\s+[\s\S]*?['\"](?:@[A-Za-z0-9._-]+/)?[A-Za-z0-9_][A-Za-z0-9._-]*(?:/(?:src|dist|lib|internal|build)/[^'\"]*|/[^'\"]*\.(?:ts|mts))['\"][\s\S]*$"
  },
  contains export_statement() as $statement where {
    $statement <: r"export\s+(?:type\s+)?(?:\*(?:\s+as\s+[A-Za-z0-9_$]+)?|\{[^}]*\})\s+from\s+['\"](?:@[A-Za-z0-9._-]+/)?[A-Za-z0-9_][A-Za-z0-9._-]*(?:/(?:src|dist|lib|internal|build)/[^'\"]*|/[^'\"]*\.(?:ts|mts))['\"][\s\S]*$"
  },
  contains call_expression() as $call where {
    $call <: r"import\s*\(\s*['\"](?:@[A-Za-z0-9._-]+/)?[A-Za-z0-9_][A-Za-z0-9._-]*(?:/(?:src|dist|lib|internal|build)/[^'\"]*|/[^'\"]*\.(?:ts|mts))['\"][\s\S]*$"
  }
}
```

## Why

Importing a package's `src` or `dist` bypasses its `exports` map, so the
dependency's internal layout becomes part of this package's interface and no
version boundary guards it. `dep/package.json` stays allowed because tools read
it to locate a package; a declared subpath stays allowed because the dependency
publishes it deliberately.

**Per-import findings.** The rule is single-file, so each offending import is
reported at its own `path:line`; no directory-batch reporting applies.

**Relative specifiers are the compiler's job.** A `../` specifier that leaves a
TypeScript composite project's root is refused by that project's own resolution,
so this rule reports no relative specifier.
