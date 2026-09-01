# Solution: A package named after a runtime is the product laundering itself as an adapter

## Problem

The stryker-js subsystem's Node host package (`@systemfsoftware/stryker-js-platform-node`) carried the mutation engine's product: the run stages, the sandbox, configuration, the checker and test-runner capabilities, reporters, and scoring. Its name claimed it implemented _ports_ — the way `@effect/platform-node` genuinely does — while the manifest declared the product itself. A prior planning session then codified the name as law, so every later consumer import and every later plan inherited the error.

The observable failure is architectural, not runtime: shipping a Bun or Deno port under the same naming scheme would require a `stryker-js-platform-bun` package containing a second copy of the entire engine, and a "portability" claim coexisting with a hard Node dependency in the same manifest.

## Failure mechanisms

1. **Suffix laundering.** A product transported into an adapter-named package borrows the adapter's contract without satisfying it. The tell: the package's _implementation_ surface (run stages, scoring, reporters) dwarfs its _port_ surface (one inert layer).
2. **Plan inheritance.** Once a plan names the misnamed package as authority, every downstream unit treats the name as settled. Authority must trace to the architecture, not to a prior plan's wording.
3. **Port-vs-product drift test.** `@effect/platform-node` implements ports and depends on nothing product-shaped. A host package that the product's own language package depends _on_ — or that bundles the product's workflow cells — is the product, whatever its name says.

## Architectural invariants

- **Runtime naming follows dependency direction.** A package may carry a runtime's name only when it _implements ports for_ that runtime and depends on nothing product-shaped. If the package _is_ the product, its name names the product (`-engine`), and the runtime appears only in packages that _bind_ it (`-cli`).
- **Host neutrality is a manifest claim, enforced.** The engine manifest carries zero `@effect/platform-*` dependencies and no `engines` field; a process-entry package carries both. The gate is a manifest read plus `attw`, not a review convention.
- **One wire codec per process edge.** Parent-to-worker options cross exactly one schema codec (`WorkerOptionsWire` → `encodeWorkerOptions` / `decodeWorkerOptions`), so encode-side and decode-side drift fails at spawn as a decode error instead of misreading options silently.
- **Vacation beats deprecation.** A wrongly named published package is deleted in the same change that introduces the correct one; no re-export shell remains for consumers to lean on. The release notes carry the migration (`major` bump, "install the new names").

## Verification

- Manifest read: engine `dependencies`/`peerDependencies` contain no `@effect/platform-*` name; no `engines` field exists.
- Import sweep: the engine source tree contains no `NodeSocket` / platform import; workers reach the engine only through the enumerated `./worker` subpath.
- Behavior: the relocated integration tests spawn real workers through the CLI's composition, so the deletion of the old host package is exercised, not just compiled.
