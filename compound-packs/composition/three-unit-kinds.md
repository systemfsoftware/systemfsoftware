---
title: Every workspace unit declares itself a library, an application or a template, and an application's package.json has no exports
applies_when:
  - creating a new package, Worker, SPA, site, CLI or template in the workspace
  - adding an exports map, a bin or a deploy script to a unit's package.json
  - another unit wants to import code that lives inside an application
  - deciding whether new code is a library or belongs inside the application that runs it
  - marking a library as core or as a contracts library in its package.json
tags: [composition, unit-kind, application, library, template, manifest]
---

## Rule

Each workspace unit states its kind in `package.json` as `"unit": "library" | "application" | "template"`, and its manifest has that kind's shape:

| Kind        | What it is                                                   | Manifest                                                                                                            |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| library     | code other units import                                      | an `exports` map of `.` only by default (pack: composition, role-entries-only.md); no `deploy` or `deploy:*` script |
| application | something deployed or run: a Worker, an SPA, a site, a CLI   | `"private": true`; **no `exports` field**; its own dev, build and deploy scripts; its composition root              |
| template    | an application copied out of the monorepo for someone to own | everything an application has, plus (pack: composition, templates-leave-the-monorepo.md)                            |

An application is deployed, never imported. Code inside an application that another unit needs moves into a library both depend on; shapes two applications exchange move into a contracts library (pack: composition, contracts-between-applications.md). Logic inside an application that needs tests below its deployed entry also moves into a library (pack: composition, tests-stay-home.md). A unit that is both imported and deployed has collapsed: split its deployable half into an application and its importable half into a library.

A library may carry one more marker, and these are the only composition keys a manifest holds:

| Key                   | On         | Meaning                                                                                                 | Read by                                          |
| --------------------- | ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `"unit"`              | every unit | its kind, from the table above                                                                          | `composition-unit-kinds`, `composition-graph`    |
| `"layer": "core"`     | a library  | value-imports no runtime and no framework (pack: composition, core-and-adapters.md)                     | `composition-graph`, `composition-core-adapters` |
| `"role": "contracts"` | a library  | holds only schemas, tagged errors and RPC groups (pack: composition, contracts-between-applications.md) | `composition-contracts`                          |

A driver adapter library carries no marker: it is a plain library that depends on the service's library (pack: composition, drivers-live-where-chosen.md).

## Why

A Worker that exports its modules turns every other unit into a consumer of its internals, and from then on it cannot change without breaking units that have nothing to do with the change. At the research snapshot (2026-10-21), younna-ai's `workers/platform` exported 136 entries (135 subpaths, no `.` root); 61 of them had no consumer at all, and its own `src` used 854 relative imports and zero self-imports, so the map existed only for other units to reach in ((pack: composition, evidence/FINDINGS.md) Cycle 006). At younna-ai `a80c7cb3b6` (2026-10-23) it still exports 24 keys. The same tree had Workers depending on Workers (`platform` on `public-site`, `app-builder`, `workspace`; `web` on `platform`).

## Evidence

- Rat Stack splits `packages/*` from `apps/{cli,infra,site,web}` and its boundary lint reports any package-to-app import (`rat-stack/scripts/oxlint-plugin-boundaries.ts:891`, message `packageApp`: "Packages cannot import application code.").
- younna-ai census: (pack: composition, evidence/FINDINGS.md) Cycle 006, measurements table and findings 1-6.
- Conflict recorded and ruled: Stead lets an application export one UI entry (`examples/apps/atlas/package.json`) so a shell can load it ((pack: composition, evidence/FINDINGS.md) Cycle 004). In this stack an application exports nothing; what a second unit needs is a library.

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```jsonc
// WRONG: workers/platform/package.json - a deployable that is also imported
{ "name": "@younna/platform", "private": true,
  "exports": { "./billing/store": "./src/billing/store.ts", "./billing/store.schema": "./src/billing/store.schema.ts" } }

// RIGHT: the Worker exports nothing; the shared code is a library
// workers/platform/package.json
{ "name": "@younna/platform", "unit": "application", "private": true,
  "scripts": { "dev": "...", "build": "...", "deploy": "..." } }
// packages/billing/package.json
{ "name": "@younna/billing", "unit": "library", "private": true,
  "exports": { ".": { "@systemfsoftware/source": "./src/mod.ts", "default": "./dist/mod.js" } } }
```

## Gate

Fact-gated: `repo-checks composition-unit-kinds` (`scripts/tools/repo-checks/composition.ts`, `checkCompositionUnitKinds`). It reads every workspace `package.json` and fails on a missing or unknown `unit`, an application that is not `"private": true`, an application with an `exports` field, and a library with a `deploy` or `deploy:*` script. Run it from the repository root: `nix run github:systemfsoftware/systemfsoftware#repo-checks -- composition-unit-kinds` (exit 0 holds, 1 violated, 2 undecided).

Not yet run in CI: `.github/workflows/ci.yml` runs only `repo-checks single-plan`, and no workflow runs any `composition-*` check (pack: composition, gates-are-facts-or-calibrated-judges.md).

A template's isolation is not checked by this gate; see (pack: composition, templates-leave-the-monorepo.md).

Known gap: the marker name `"layer"` reads like Effect's `Layer` module. Renaming it (for example to `"library": "core"`) is a change to `composition.ts` and every manifest together, done in one change under (pack: composition, unpublished-surfaces-are-free.md); until then `"layer": "core"` is the key the gates read.
