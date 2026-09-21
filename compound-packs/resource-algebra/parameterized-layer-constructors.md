---
title: Libraries export parameterized layer constructors, never static Live singletons
applies_when:
  - exporting Layer definitions from a reusable library or SDK package
  - naming layers and constructors in package boundaries
  - integrating resource specifications into Effect Layer stacks
tags: [resource-algebra, layer, constructors, package-boundary]
---

In Effect, the `*Live` naming convention belongs strictly to application composition roots where a concrete implementation is chosen over a test double (e.g. `DatabaseLive`, `EmailClientLive`). Reusable library and SDK packages do not export static `Live` singletons:

### 1. Constructors over Singletons

A library does not have a single ambient "Live" configuration. External entities (containers, databases, message brokers, background processes) are parameterized by their specifications. The package exports parameterized layer constructors:

```ts
// RIGHT: Parameterized layer constructor on the definition
const redis = Container.make('redis:7-alpine').withExposedPorts([6379])
const RedisLayer: Layer.Layer<RunningContainer, ContainerError, ...> = redis.layer

// WRONG: Static application-style singleton
export const ContainerLive: Layer.Layer<ContainerDriver, ...> = ...
```

### 2. Context Service Binding on Demand

When a resource should be bound to a specific application service tag, the library provides layer synthesis on demand:

```ts
// Exposes the running resource under an application-defined service tag:
export const layerTag = <Id, Resource, Error, R>(
  tag: Context.Tag<Id, Resource>,
  spec: ResourceSpec<Resource>,
): Layer.Layer<Id, Error, R> => Layer.scoped(tag, spec.scoped)
```

### 3. Elimination of Dummy Driver Intermediaries

Consumers do not yield an intermediate "Driver Starter" tag from Context just to start a resource. The layer directly provisions the active resource:

```ts
// WRONG: Forcing an intermediate service tag and Live layer onto consumer
const program = Effect.gen(function*() {
  const driver = yield* ContainerDriver.ContainerDriver
  const instance = yield* driver.start(spec)
})
program.pipe(Effect.provide(ContainerDriver.ContainerDriverLive))

// RIGHT: The definition compiles directly to the Layer providing the running resource
const program = Effect.gen(function*() {
  const container = yield* Container.RunningContainer
  yield* container.exec('redis-cli', ['ping'])
})
program.pipe(Effect.provide(redis.layer))
```

Gate: `review` — verify the package exports parameterized layer constructors (`resource.layer` or `layer(spec)`) and exports zero static `*Live` singletons.
