---
title: Libraries export parameterized layer constructors, never static Live singletons
applies_when:
  - exporting Layer definitions from a reusable library or SDK package
  - naming layers and constructors in package boundaries
  - integrating resource specifications into Effect Layer stacks
tags: [resource-algebra, layer, constructors, package-boundary]
---

In Effect, the `*Live` naming convention belongs to application composition roots where a concrete implementation is chosen over a test double. Reusable library and SDK packages do not export static `Live` singletons:

- **Constructors over Singletons**: Packages export factory functions that take configuration or specifications and return a `Layer`:
  ```ts
  // RIGHT: Parameterized layer constructor
  export const layer = (spec: MicroVMSpec): Layer.Layer<RunningVM, MicroVMError, ...> => ...

  // WRONG: Static application-style singleton
  export const MicroVMLive: Layer.Layer<MicroVM, ...> = ...
  ```
- **Context Tag Binding on Demand**: When a resource should be injected into the environment as a service tag, the library provides a constructor:
  ```ts
  // Exposes the running resource under a specific tag:
  export const layerTag = <Id>(tag: Context.Tag<Id, RunningVM>, spec: MicroVMSpec): Layer.Layer<Id, MicroVMError, ...>
  ```
- **No Dummy Service Intermediaries**: Consumers do not yield an intermediate "Service Starter" tag from Context just to start a resource. The layer directly provisions the active resource.
