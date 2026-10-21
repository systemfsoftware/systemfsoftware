---
title: Split a library when its consumers use disjoint halves or different runtimes; merge two libraries that always change together; no library with one consumer and no reuse
applies_when:
  - deciding whether new code needs its own package
  - a package has grown two unrelated responsibilities
  - two packages are always edited in the same commits
tags: [composition, granularity, split, merge]
---

A library boundary exists to let things change independently. Split a library when its consumers fall into groups that use disjoint parts of it, or when one part must run where the other cannot (`core-and-adapters`). Merge two libraries when their histories show they change together. Code with a single consumer and no second use stays inside that consumer until a second consumer appears.

Deno std shows small packages working, but only with per-module ownership and mechanical checks. Without those, micro-packages spread and every change becomes a multi-package release.

Gate: `repo-checks composition-granularity` reports (and from the second report, fails) a library with exactly one dependent workspace unit and no published consumers, plus pairs of libraries co-changed in more than 80% of the last 50 commits that touched either.
