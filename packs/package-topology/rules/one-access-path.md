# A package's barrel re-exports its own modules, never another package's

`mod.ts` and `index.ts` are the files a directory exposes as this package's
surface. A barrel that re-exports from a bare specifier — `export * from
"dep"`, `export * as ns from "dep"`, `export { a } from "dep"`, or any of
their type-only forms — hands out another package's symbols as this package's
own, giving each symbol a second access path beside its origin and coupling this
package's surface to the dependency's. A specifier is bare when it neither
starts `./`/`../` nor names a `node:` builtin. Next: re-export from a relative
module of this package instead, and import the other package where the symbol is
actually used; if the symbol must be published here, export a local module that
imports it and re-shapes it.

```grit
language js
multifile {
  file($name, $body) where {
    $name <: r"(?:.*/)?(?:mod|index)\.ts",
    $body <: contains export_statement() as $statement where {
      $statement <: r"export\s+(?:type\s+)?(?:\*(?:\s+as\s+[A-Za-z0-9_$]+)?|\{[^}]*\})\s+from\s+['\"](?:@[A-Za-z0-9._-]+/)?[A-Za-z0-9_][A-Za-z0-9._-]*(?:/[^'\"]*)?['\"]\s*;?\s*$"
    }
  }
}
```

## Why

A symbol reachable both from its own package and from this barrel has two
canonical names, so neither can change alone: consumers split across both, and
this package's version must move whenever the dependency's surface does.

**Type-only re-exports are refused too.** `export type { A } from "dep"`
reaches no runtime code, but it still republishes another package's declaration
as this package's surface, so the same coupling holds; there is no reading under
which the access path is this package's own.

**One finding per directory.** The rule is multifile so gritlint parses only
`mod.ts`/`index.ts` files; a multifile match is reported against the first
matching file of its directory batch, so the message names that directory.
