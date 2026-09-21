---
title: Resource algebras are authored in hyphen-cased *.resource.ts files
applies_when:
  - creating a resource specification or algebra module
  - naming files that export fluent staged builders and execution capabilities
  - structuring file taxonomy for capability packages
tags: [resource-algebra, file-convention, naming, pipeable]
---

In capability packages, resource algebras must be authored in dedicated hyphen-cased `*.resource.ts` files (e.g. `micro-vm.resource.ts`, `redis-container.resource.ts`):

- **Hyphen-Cased Role Suffix**: Mirrors `@systemfsoftware/effect-cell-types` naming conventions (`*.cell.ts`, `*.workflow.ts`, `*.schema.ts`). A module declaring an executable resource definition uses the `*.resource.ts` suffix.
- **Pipeable Law**: Every configured resource builder implements `Pipeable.Pipeable` and spreads `...Pipeable.Prototype`. Combinators are duals (`dual(2, ...)`), providing full parity between fluent method chaining and `pipe(...)` composition.
- **Separation from Pure Schemas**: Data schemas live in `*.schema.ts` files (enforcing `schema-file-exports-schemas-only`). The resource algebra in `*.resource.ts` imports the schema and equips it with combinators, lawful phase ordering, and execution handles.
- **Internal Export Boundary**: The primary namespace barrel (`MicroVM.ts` / `mod.ts`) re-exports the resource algebra from `*.resource.ts`.

```ts
// WRONG: CamelCase or generic names without role suffix
src / MicroVMSpec.ts
src / sandboxBuilder.ts

// RIGHT: Hyphen-cased *.resource.ts suffix
src / micro - vm.resource.ts
```

Gate: `review` — verify resource builders and combinators are declared in `*.resource.ts` and implement `Pipeable`.
