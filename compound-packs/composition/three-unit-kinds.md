---
title: Every workspace unit declares itself a library, an application, or a template, and each kind has a fixed manifest shape
applies_when:
  - creating a package, worker, site or template in the workspace
  - adding exports, bin or deploy scripts to a unit's package.json
  - deciding whether new code is a library or belongs inside an application
tags: [composition, unit-kind, manifest, workspace]
---

A workspace holds exactly three kinds of unit. Each declares its kind in `package.json` under `"unit": "library" | "application" | "template"`.

| Kind        | Is                                                         | Manifest                                                                                                            |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| library     | code other units import                                    | `exports` (see `role-entries-only`), no deploy scripts, no `bin` unless it is a CLI library                         |
| application | a deployable: a Worker, an SPA, a static site, a CLI       | `"private": true`, **no** `exports` (`applications-export-nothing`), dev/build/deploy scripts, its composition root |
| template    | a deployable copied out of the monorepo for someone to own | everything an application has, plus `templates-leave-the-monorepo`                                                  |

A unit that is both imported and deployed has collapsed. Its deployable half moves into an application and its importable half into a library.

Gate: `repo-checks composition-unit-kinds`. It reads every workspace `package.json` and fails on a missing kind or a manifest that contradicts its kind.
