# Patched vendored grammar

This is the `tree-sitter-typescript` crate gritql vendors at rev
`4ca283484ab9bd11ca3cbc9e14b5ad2db5d61a37` (the tip of `biomejs/gritql`'s
`main`), consumed through the `[patch]` entry in the workspace `Cargo.toml`.
Three grammar deltas let it parse constructs TypeScript accepts and real
consumers use; every other file is untouched.

`common/define-grammar.js`:

1. `export_statement` also accepts `export type * from "..."` and
   `export type * as ns from "..."` (TypeScript 5.0) beside the existing
   `export type { ... }` form.
2. `_type` includes the two `_type_query_*_in_type_annotation` aliases under
   `prec(-1, ...)`, so `import("...").Ns.Type` parses in every type position
   (unions, aliases, generics), not only directly after a `:` annotation. This
   mirrors upstream `tree-sitter/tree-sitter-typescript`, whose `type` rule
   carries the same two members.

`common/scanner.h`:

3. `scan_automatic_semicolon` treats a newline before `<` like one before `(`
   or `[`: it inserts the automatic semicolon outside an expression (where
   `||` is valid), so an object type's call signatures may be separated by a
   newline even when the next signature opens with type parameters. Upstream
   still refuses this case.

Regenerate `typescript/src` and `tsx/src` after editing the two shared files:

```sh
cd typescript && npx tree-sitter@0.20.8 generate --no-bindings
cd ../tsx && npx tree-sitter@0.20.8 generate --no-bindings
```

`0.20.8` matches the `LANGUAGE_VERSION 14` these parsers record and the
`tree-sitter` 0.20 runtime the crate links.
