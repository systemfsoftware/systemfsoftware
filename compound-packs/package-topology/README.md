# Package Topology Compound Pack

What earns a package, what earns a subpath export, and what may sit on a package's public surface.

Rules in this pack govern:

- Earning a package: an external binder or a platform substrate, and the port-versus-product test for host packages (`earned-package-boundary`).
- Earning a subpath export: five justifications, one import path per symbol (`subpath-justification`).
- Anchoring every export to a type its module declares, and the five published shapes of a capability package (`export-anchoring`).
- What may run when a module is imported (`import-time-inertness`).
- The export map and the forgotten-export check as the definition of public (`export-map-defines-public`).

Barrel shape is governed by `cell-architecture/single-namespace-barrel.md`. Methods on schema classes are governed by `schema-laws/data-only-schema-classes.md`. File suffixes and folder layout are governed by `cell-architecture/service-and-layer-boundaries.md`. Export-map condition keys are governed by `packs/source-resolution`.
