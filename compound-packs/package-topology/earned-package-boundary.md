---
title: A new package is earned by an external binder or a platform substrate, never by layering one capability
applies_when:
  - adding a new package to the workspace
  - splitting a package into two or more packages
  - deciding whether code belongs in an existing package or a new one
  - naming a package after a runtime or host platform
  - adding a package whose entry only re-exports another package
tags: [package-topology, package-boundary, external-binder, substrate, umbrella]
---

One capability is one package. Its vocabulary, workflows, cells, and published fakes are modules inside that package, published from its root entry.

A separate package is earned by exactly two conditions:

- **External binder.** A dependency that appears in the public signature and that some consumers do not want: a test runner (`vitest`), a UI runtime (`react`, `react-dom`), a story framework (`storybook`), a compiler or bundler plugin host (`vite`). `@systemfsoftware/effect-atom-react` is earned by `react`; `@systemfsoftware/storybook-gherkin` by `storybook`.
- **Substrate contamination.** A platform substrate, such as Node builtins, a native binary, or a database driver, that a consumer running elsewhere must not be forced to install. A driver package (`ledger-pg`) and an executable composition root (`ledger-cli`) are earned this way.

Reject:

- **A split with no earner.** Two packages for one capability, such as `search-language` and `search-engine`, or a vocabulary package beside a workflow package, version separately for no consumer benefit.
- **The product inside a host package.** A package named for a runtime (`*-platform-node`) is correct only when it implements ports for that runtime and depends on nothing product-shaped, the way `@effect/platform-node` does. When the product's workflows, cells, or configuration live in it, porting to another runtime means copying the product. The test is the manifest and the import graph, not the name.
- **An umbrella.** A package whose entry only re-exports other packages (`export * from '@scope/other'`) adds a version line and an access path, and no code.

```text
WRONG
packages/search-language/   # schemas, ports
packages/search-engine/     # workflows, cells; no binder, no substrate

RIGHT
packages/ledger/        # whole capability; depends on effect only
packages/ledger-pg/     # earned: Postgres driver
packages/ledger-cli/    # earned: executable composition root
```

Gate: `review`.
