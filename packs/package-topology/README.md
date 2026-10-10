# package-topology

Rules that keep a published package's surface declared, single, and reachable
only where it was published, as `compound-packs/package-topology` requires. A
package counts as published when its `package.json` has a `name` and no
`"private": true`. These are the checks `attw` does not cover: the shape of the
export map, one access path to each symbol, and no import of another package's
internals.

| Rule                | Refuses                                                                                                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exports-map-shape` | a manifest whose only entry fields are a top-level `main`/`module`/`types`, a wildcard (`*`) export subpath, or a code entry object with `default`/`import` but no `types` |
| `one-access-path`   | a `mod.ts`/`index.ts` barrel that re-exports a bare package's symbols (`export *`, `export * as`, or `export { ... } from`, including type-only forms)                     |
| `no-deep-import`    | an `import`, `export ... from`, or dynamic `import()` of a package's `src`/`dist`/`lib`/`internal`/`build` subpath, or of a specifier ending `.ts`/`.mts`                  |

## Enable it

```json
{
  "packs": {
    "package-topology": {}
  }
}
```

The pack takes no parameters.

## How an agent consumes a finding

Each finding is a JSON object with `rule` (the stable id, such as
`package-topology/no-deep-import`), `path` (the file's path relative to the scan
root), `line` (1-based), and `message` (what is wrong, then the one concrete
next action after `Next:`). The process exits `1` when any finding exists, so a
finding is a failing command rather than an opinion. The next action per rule:

- `exports-map-shape`: put every importable specifier under `exports`, replace a
  wildcard with the subpaths it stands for, and add a `types` branch to every
  code entry object.
- `one-access-path`: re-export from a relative module of this package, and
  import the other package where the symbol is used.
- `no-deep-import`: import the package's root or a subpath it declares; if the
  module is meant to be public, add it to that package's `exports`.

## Design notes

- **Data assets are not code entries.** An export entry whose target ends
  `.json` carries no declarations, so `exports-map-shape` does not require a
  `types` branch for it, and `no-deep-import` allows `dep/package.json`.
- **Private packages are exempt.** A manifest with `"private": true` publishes
  nothing, so `exports-map-shape` skips it.
- **Type-only re-exports count as a second access path.** `export type { A }
  from "dep"` reaches no runtime code, but it still republishes another
  package's declaration as this barrel's surface, so `one-access-path` refuses
  it. `source-resolution/export-map-order` owns the condition keys and their
  order inside an entry; this pack owns the shape of the map and of the surface.
- **Relative escapes are the compiler's job.** A `../` specifier that leaves a
  TypeScript composite project's root is refused by that project's own
  resolution, so `no-deep-import` reports no relative specifier.
- **A module the pinned grammar cannot parse stops a single-file rule.**
  `no-deep-import` is single-file, so gritlint parses every module of the
  language, and the pinned TypeScript grammar fails on two generic call
  signatures separated only by a newline (the `dual` overload shape). gritlint
  reports that as an error rather than skipping the file, so one such module
  fails the check for the whole run; `packs/cell-architecture/README.md`
  records the same gap and a fix that survives the formatter (an intersection of
  function types).
- **One finding per manifest or directory.** `exports-map-shape` and
  `one-access-path` are multifile so that gritlint parses only `package.json`
  and `mod.ts`/`index.ts` files; a multifile match is reported against the first
  file of its directory batch, so the message names the directory.
  `no-deep-import` is single-file, so each offending import is reported at its
  own `path:line`.
