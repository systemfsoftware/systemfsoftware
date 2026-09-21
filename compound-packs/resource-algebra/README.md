# Resource Algebra Compound Pack

This pack codifies the architectural rules for **Capability & Infrastructure Tooling Packages** in Effect (such as container drivers, client libraries, sandboxes, and hardware engines).

Unlike business applications that use Hexagonal/Clean Architecture (abstract capability ports separate from application-side `*Live` adapters), capability packages **are themselves the engine**. Forcing a library to export dummy `Context.Service` tags and static `Live` singletons creates artificial ceremony for consumers.

This pack provides the rules for **executable resource algebras**: pure specification data that compiles directly into Effect `Scope`-managed acquisitions and parameterized `Layer` constructors.

## Rules in this Pack

- `spec-resource-algebra.md`: Specifications are immutable, fluent data algebras that declare target resources.
- `scoped-lifecycle-first.md`: Execution compiles directly to native Effect `Scope` and finalizers, not imperative start/stop driver handles.
- `parameterized-layer-constructors.md`: Libraries export parameterized `layer(spec)` constructors, never static `*Live` singletons.
- `internal-engine-boundary.md`: Internal cell pipelines and pure workflows drive execution without leaking port ceremony to consumers.
- `single-namespace-barrel.md`: Primary abstractions export as single cohesive namespace barrels matching Effect lineage.
- `resource-file-convention.md`: Resource algebras are authored in hyphen-cased `*.resource.ts` files with `Pipeable` compliance.
