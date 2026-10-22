---
title: Split a library when its consumers use disjoint halves or different runtimes; merge two libraries that always change together; no library with one consumer and no reuse
applies_when:
  - deciding whether new code needs its own package
  - a package has grown two unrelated responsibilities
  - two packages are always edited in the same commits
tags: [composition, granularity, split, merge]
---

A library boundary exists to let things change independently. Split a library when its consumers fall into groups that use disjoint parts of it, or when one part must run where the other cannot (`core-and-adapters`). Merge two libraries when their histories show they change together. Code with a single consumer and no second use stays inside that consumer until a second consumer appears.

A library nobody imports is not always unused. A command-line tool (a `bin`), a deployed entry point (a `wrangler` config), a runner invoked by its scripts, a package of configuration read as data, and a toolchain dependency another unit declares without importing are run or read, not imported, so having no dependents says nothing against them. A published library may have one workspace dependent because its other consumers are outside the workspace.

Deno std shows small packages working, but only with per-module ownership and mechanical checks. Without those, micro-packages spread and every change becomes a multi-package release.

Gate (judge-gated, `granularity`, calibration kappa 0.78 over 32 cases, see the README): `repo-checks composition-granularity` collects the candidates from facts (a library with at most one dependent, a pair co-changed in more than 80% of the last 50 commits touching either, consumers using disjoint entries) and gives the panel those facts plus whether the library has a `bin`, a deploy config or run scripts, and whether each dependent imports it or only declares it. Whether a unit is a library to merge, or a tool that is run, is its declared kind, so a unit with no declared `unit` is reported and never fails. A violated verdict from both panel members is a finding that fails with `--strict` while the kappa stays at or above 0.7; without `--strict` it reports.
