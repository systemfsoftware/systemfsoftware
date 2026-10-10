# cell-architecture

Rules that keep a cell-architecture package's service modules free of drivers,
as `compound-packs/cell-architecture/service-and-layer-boundaries.md` requires:
a `*.service.ts` module holds the Service class and may carry a pure
`static readonly layer` on it, and a Layer that needs a driver or platform
runtime lives in a separate adapter module (placement: pending ruling).

| Rule                       | Check                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `service-exports-no-layer` | a `*.service.ts` module imports no driver or platform specifier, exports no module-level Layer value or factory, exports no `*Live`, declares no class field named `*Layer` or `*Live` or aliasing a Layer, re-exports no `layer`, `*Layer` or `*Live`, and exports no binding (`const`, `let`, `var`, or `default`) bound to one |

## Enable it

```json
{
  "packs": {
    "cell-architecture": {}
  }
}
```

The pack takes no parameters.

## Design notes

- **A placement rule.** The rule governs what a `*.service.ts` module may hold,
  which is where a Layer may live; it states no testing requirement. A Layer
  built from a driver belongs in a separate adapter module (placement: pending
  ruling), so the rule never reports a file outside `*.service.ts`.
- **A pure static layer is allowed.** `static readonly layer`, `layerTest` and
  `layerConfig` on the Service class pass, in the two-argument form
  `Layer.effect(this, this.make)` and the curried form
  `Layer.effect(this)(this.make)`, and so does a layer that requires a platform
  service such as `FileSystem` in its `R` channel without providing it. A
  `Layer.*` call is reported only in an exported module-level statement.
- **A tripwire for driver imports.** The rule matches a service module's own
  import, `import()` and re-export specifiers against a reviewed preset, the
  `driver_specifier` pattern in the rule: `node:*` and the Node built-ins that
  reach the operating system, `@effect/platform-*`, `@effect/sql-*`,
  `@effect/ai-*`, and a short list of database clients and vendor SDKs. A type-only
  import counts, because a driver type in a contract's shape reaches every
  consumer. gritlint does not follow imports, so a driver reached through
  another module passes; the package graph is the control there: a contract
  package whose manifest declares no driver cannot import one. The rule
  places `driver_specifier` below the `multifile` block on purpose: gritlint
  reads a rule's kind from its first body line, and a rule that does not open
  with `multifile` runs as a single-file rule that reports every module of the
  directory.
- **Values, not types.** A `Layer.Layer<...>` type alias in a service module is
  not reported, and neither is a type-only re-export (`export type { ClockLayer }`
  or `export { type ClockLayer }`): each names a Layer without building one, and
  importing it pulls in no implementation.
- **Names, not bindings.** A re-export or an exported binding counts as a Layer
  when the value it exports is named `layer`, `*Layer` or `*Live`: an
  identifier or the last property of a member access, such as `Driver.layer`,
  through a type annotation, `as`, or `satisfies`, and including
  `export default layer`. gritlint does not resolve imports, so a Layer bound to
  any other name is not reported, and neither is a namespace re-export
  (`export * from` or `export * as Driver from`), whose name says nothing about
  what it carries.
- **Known gaps.** A tag declared in a module with another suffix, beside a
  Layer, is not reported. Inside the Service class, the rule judges member
  names and imports, not what a member builds: a static layer that provides a
  Layer imported from a relative module, or a static method that returns a
  Layer, passes when the module imports no driver specifier.
- **Unparseable modules stop the scan.** The pinned TypeScript grammar reads
  two generic call signatures separated only by a newline (in a type literal or
  an interface, the shape `dual` overloads take) as one type expression and
  fails to parse the module. gritlint reports that as an error rather than
  skipping the file, so such a `*.service.ts` fails the check. Separators fix
  the parse but a formatter set to omit semicolons strips them; an intersection
  of function types (`& (<A>(a: A) => A) & (...)`) parses and survives it.
- **One finding per directory, at the first service module.** The rule is
  multifile so that only `*.service.ts` modules are parsed; a single-file rule
  parses every module of the language, and any unparseable one would stop the
  scan. A multifile match is reported against the first file of its directory
  batch, so when several `*.service.ts` modules share a directory the finding
  names the alphabetically first of them at line 1, whichever one holds the
  Layer. The verdict is exact; search that directory's service modules for the
  Layer.
