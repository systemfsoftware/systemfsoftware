---
title: A library or adapter is removable by deleting its folder and, in each application that provides it, its dependency, import and provide line, with every other import unchanged and the full gate green
applies_when:
  - adding a new library, adapter, vendor integration or feature package
  - reviewing a change that wires a new Layer into an application
  - removing a feature, a vendor or a package
  - a change to one package needs edits in many unrelated packages
tags: [composition, removal, cartridge, layers, acceptance-test]
---

## Rule

A unit composes only if it can be taken out. For any library or driver adapter:

- **Push in** is, in each application that provides the unit, one dependency, one import and one `Layer.provide` (or one Stack entry) at its composition root. That is one application for most units and exactly two for a driver adapter whose Layer declares Cloudflare resources: the infrastructure application provides it in the Stack to provision them, and the runtime application provides it to serve through them (pack: composition, stack-has-one-owner.md).
- **Pull out** is deleting the unit's folder and, in each of those applications, its dependency line, its import and its provide line. Afterwards no other file's import path changes, and the repository's full gate (typecheck, lint, test, build, and the composition checks) is green.
- **Self-contained**: the unit declares its own resources and requires their binding services (`Cloudflare.D1.QueryDatabaseBinding`), never a binding object (pack: composition, stack-has-one-owner.md), so pulling it out leaves no orphaned resource.

A unit that cannot be pulled out this way names its coupling in the change that adds it: the extra import paths that would break, and why they are not yet behind a service.

## Why

Every other rule in this pack describes a boundary; this one tests it. Coupling that review misses shows up here as a broken import elsewhere, a duplicated type, or a resource that outlives its owner. In younna-ai, 149 of 378 declared subpaths had no consumer and nothing noticed ((pack: composition, evidence/FINDINGS.md) Cycle 006, at the 2026-10-21 snapshot); a removal test is the only check that asks "what depends on this" by actually taking it away.

## Evidence

- Rat Stack's cartridge test, from its website corpus (`ratstack.sh/lore/cartridges` and `ratstack.sh/lore/a-clean-playground`): labeled (one package, one job), push in (one package plus one `Layer.provide` or Stack line), pull out (delete the package and the line, `pnpm turbo run check test build` still green), self-contained, easy to throw away ((pack: composition, evidence/FINDINGS.md) Cycle 005, finding 4).
- Rat Stack's repository holds per-feature removal checklists, a "Keep or cut" table naming files, dependencies and config entries ((pack: composition, evidence/FINDINGS.md) Cycle 005, finding 7; file and lines pinned in (pack: composition, evidence/SOURCES.md)).
- Rat Stack's website corpus, not its repository, admits it has not proven one-line infrastructure removal for `packages/subscriber-delivery` ((pack: composition, evidence/FINDINGS.md) Cycle 005, finding 12); no source in the survey has a mechanical removal check ((pack: composition, evidence/PACK.md) "Limits of this evidence").

Upstream paths are relative to the repositories pinned in (pack: composition, evidence/SOURCES.md).

## Wrong / right

```text
WRONG: removing @scope/flags-kv also needs edits in apps/web/src/routes/*.tsx (they import
       @scope/flags-kv's KV type) and packages/billing (it re-exports the flag schema).

RIGHT: apps/web imports the Flags service from @scope/flags. FlagsKv.layer declares its KV
       namespace, so apps/infra/alchemy.run.ts and apps/web/src/main.ts each import
       @scope/flags-kv and provide FlagsKv.layer({ id: 'web' }). Removing @scope/flags-kv
       deletes packages/flags-kv and, in each of those two applications, one dependency
       line, one import and one provide line; the gate stays green.
```

## Gate

Gate: none yet. It would run on a scratch checkout: delete the unit's directory, its dependency declarations and every import and provide call site the compiler finds for its exported Layers, then run the repository gate and `repo-checks composition-graph`; the facts read are the gate's exit code and the list of files outside the unit that fail to compile. Until it exists, a change that adds a library or adapter states, in its description, the files and lines a removal would delete.
