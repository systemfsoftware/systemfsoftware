---
title: Every condition branch of one entry exposes the same names and types
applies_when:
  - adding a condition branch that resolves an entry to a different file
  - changing how an entry's types are emitted or bundled
  - restructuring re-exports in an entry that is built by tsdown
tags: [package-topology, exports-map, conditions, types]
---

One entry has one public API, whichever branch resolves it: the source condition in the workspace, the `types` and `default` files a consumer installs, or a platform-specific branch. A name the runtime file exports and the types file does not, or the reverse, gives consumers a different package depending on their resolver and build settings.

This is the defect recorded in `docs/solutions/build-errors/dts-emitter-drops-bundled-entry-reexports.md`: the built `.mjs` kept six names that the built `.d.ts` dropped, while every in-repo check passed. Review such a change against the built output, not the source condition: build into an empty `dist/`, compare the names the entry's `.mjs` and `.d.ts` export, and treat a bundler `IMPORT_IS_UNDEFINED` warning as a failure.

Condition keys and their order follow Node's resolution rules and are checked by the gritlint pack `packs/source-resolution`.

Gate: `review`.
