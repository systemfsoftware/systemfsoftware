---
title: A change to the declared surface is versioned by what it removes, renames, narrows, or adds
applies_when:
  - removing, renaming, or moving an export or a subpath of a published package
  - bringing an existing published package into line with another rule in this pack
  - changing the type of an exported function or value
tags: [package-topology, versioning, changeset, breaking-change]
---

The declared surface is the exports map, the names each entry exports, and the types those names reach. Classify every change against it and record the bump in the changeset:

- removing, renaming, or narrowing anything in it is `major`;
- a backward-compatible addition is `minor`;
- a change it does not show is `patch`, unless existing consumers can observe the behavior change, which a type diff cannot rule out.

Packages are consumed outside this repository. Fixing an existing package that breaks another rule in this pack, such as dropping a duplicate subpath or replacing a wildcard re-export, usually removes or renames something consumers import. It ships as its own `major` change, decided with the package's owner, never as a side effect of unrelated work.

Gate: `review`; the changeset bump records the classification.
