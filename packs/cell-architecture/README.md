# cell-architecture

Rules that keep a cell-architecture package's service ports apart from the
Layers that implement them, as
`compound-packs/cell-architecture/ports-separate-from-layers.md` requires.

| Rule                       | Check                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `service-exports-no-layer` | a `*.service.ts` module makes no `Layer.*` call, declares no class field named `layer` or `*Layer`, and exports no `*Live` |

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
  which is where a Layer may live; it states no testing requirement. A Layer in
  a driver module (`src/drivers/<what-it-binds>.ts`) is the fix, so the rule
  never reports a file outside `*.service.ts`.
- **Values, not types.** A `Layer.Layer<...>` type alias in a service module is
  not reported: it names a Layer without building one, and importing it pulls in
  no implementation.
- **Known gaps.** A tag declared in a module with another suffix, beside a Layer,
  is not reported. A Layer built without a `Layer.*` call and assigned to an
  export not named `*Live` (for example `export const clock = otherModule.layer`)
  is not reported either.
- **Unparseable modules stop the scan.** The pinned TypeScript grammar reads
  two generic call signatures separated only by a newline (in a type literal or
  an interface, the shape `dual` overloads take) as one type expression and
  fails to parse the module. gritlint reports that as an error rather than
  skipping the file, so such a `*.service.ts` fails the check. Separators fix
  the parse but a formatter set to omit semicolons strips them; an intersection
  of function types (`& (<A>(a: A) => A) & (...)`) parses and survives it.
