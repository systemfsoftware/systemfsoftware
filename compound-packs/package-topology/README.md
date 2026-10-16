# Package Topology Compound Pack

What a published package's public surface may contain and how it may change: which specifiers resolve, which names each entry exposes, how many ways a symbol can be reached, which types become public, what importing runs, and how changes are versioned.

Rules:

- `declared-entry-points`: the exports map lists every importable specifier; a subpath exists for chunking or a host contract, and an entry assembling other modules must hide at least two of them.
- `enumerated-entry-modules`: entry modules enumerate their exports and are either pure surface or one unit.
- `one-access-path`: one name at one entry per symbol.
- `public-signature-types`: types a signature reaches are published; service tags are public when consumers provide them.
- `import-time-inertness`: importing an entry runs none of the package's effects.
- `condition-branch-agreement`: every condition branch of an entry exposes the same names and types.
- `surface-changes-are-versioned`: changes are classified against the declared surface.

Barrel shape is governed by `cell-architecture/single-namespace-barrel.md`, and which Layers a library publishes by `cell-architecture/service-and-layer-boundaries.md`. Export-map condition keys are checked by the gritlint pack `source-resolution` (systemfsoftware/gritlint).
