# Composition Compound Pack

How the units of a TypeScript monorepo compose instead of collapsing into each other. It covers which kinds of unit exist, which may depend on which, where tests reach code, where configuration and Layers are bound, and how a template leaves the monorepo. `package-topology` governs one published package's surface. This pack governs the graph of units and the applications at its edges.

Every rule names a mechanical gate. A rule that only review enforces does not hold: in younna-ai, review let a Cloudflare Worker publish 136 subpath exports, most of them internals exposed so tests could import them.

Rules:

- `three-unit-kinds`: every workspace unit declares itself a library, an application, or a template, and each kind has a fixed manifest shape.
- `dependency-direction`: edges point from applications to libraries and from libraries to lower libraries; nothing imports an application, and the graph has no cycles.
- `applications-export-nothing`: an application's manifest has no `exports`; what two applications share lives in a library both depend on.
- `core-and-adapters`: runtime- and framework-neutral code lives in a core library; each runtime or framework gets an adapter library; runtime choice is an export condition, never a deep path.
- `role-entries-only`: a library's entries are its root namespace barrel plus named roles; internals are blocked in the exports map; the entry count is capped by a check.
- `tests-stay-home`: tests import their own package relatively and other packages only through public specifiers; nothing is exported so a test can reach it.
- `source-condition-resolution`: workspace packages resolve to source through a custom export condition, so neither development nor tests need a build or a deep import.
- `config-at-the-edge`: only applications read configuration and choose Layers; libraries take their dependencies as services.
- `contracts-between-applications`: two applications that talk share a contracts library (schemas, RPC groups); neither imports the other.
- `templates-leave-the-monorepo`: a template builds, tests and deploys after being copied out alone, with published dependencies and no monorepo tooling.
- `split-by-consumer-merge-by-co-change`: split a library when its consumers use disjoint halves or different runtimes; merge two that always change together; no library with one consumer and no reuse.
- `unpublished-surfaces-are-free`: an unpublished workspace library has no versioned surface, so a wrong shape is deleted and rebuilt rather than kept alive for compatibility.

Evidence base (source trees read 2026-10-21): TanStack Router and Query (`query-core` has no dependencies or peers; router-core adds only runtime entries; runtimes are export conditions), Vitest (role entries plus an explicit `./internal/*`; the `__vitest_source__` custom condition; internal `@vitest/*` packages bundled into `vitest`), Deno std (a package per module; `_tools/check_mod_exports.ts`; `_` prefix for private files; `unstable_` tier), Effect 4 (`effect-smol`: one namespace barrel; `./internal/*: null` plus a lint rule; services in core and implementations in runtime packages), Rat Stack (layers carry their cloud resources; removal checklists; the fence), and nythrox/Stead (a shell, a desktop and apps that compose through manifests, not imports).

Service and Layer placement inside a library is governed by `cell-architecture/service-and-layer-boundaries.md`, the barrel shape by `cell-architecture/single-namespace-barrel.md`, and a published package's surface by `package-topology`.

Gates: implemented. Each `repo-checks composition-<check>` is a subcommand of this repository's `repo-checks` app (`scripts/tools/repo-checks/composition.ts`), so any enrolled repository runs the same check from its root: `nix run github:systemfsoftware/systemfsoftware#repo-checks -- composition-unit-kinds composition-graph composition-entries composition-imports composition-contracts composition-granularity`. Exit 0 holds, 1 a violation, 2 undecided. `composition-granularity` reports on every run and fails only with `--strict`. A unit that has not yet declared its kind is judged as a library by `composition-entries` and `composition-graph`, so the cap and the core and environment rules apply before the declarations land. Imports and environment references are read from code only: a specifier or `process.env` inside a string, template or comment is ignored. The `template-isolation` gate is a CI job each repository adds for its templates.
