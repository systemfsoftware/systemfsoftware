---
title: Resource builders and combinators must implement full Pipeable and dual parity
applies_when:
  - authoring combinators and methods on resource builders
  - implementing fluent APIs in capability packages
  - integrating builders with Effect pipe workflows
tags: [resource-algebra, pipeable, dual, combinators, effect-style]
---

In accordance with `skill://gcanti-tim-smart-style` (Rule `R6`), every fluent builder and combinator must provide full parity between direct method chaining and data-last functional composition using Effect's `pipe(...)`.

### 1. Prototype-Backed Pipeable

Resource builders must extend `Pipeable.Pipeable` and spread `...Pipeable.Prototype` into their prototype or factory object:

```ts
import { type Pipeable, Prototype } from 'effect/Pipeable'

export interface ResourceBuilder<Spec> extends Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly spec: Spec
  withPort(port: number): ResourceBuilder<Spec>
  // ...
}
```

### 2. Dual Combinator Parity (Rule R6)

Every standalone combinator function must be wrapped in `dual(2, ...)` (from `effect/Function`), supporting both data-first method calls and data-last pipe arguments:

```ts
export const withPort: {
  (port: number): <Spec extends BaseSpec>(spec: Spec) => Spec
  <Spec extends BaseSpec>(spec: Spec, port: number): Spec
} = dual(2, <Spec extends BaseSpec>(spec: Spec, port: number): Spec => ({
  ...spec,
  port,
}))
```

```ts
// WRONG: Method-only builder that breaks pipe composition
const resource = Container.make('postgres:16')
pipe(
  resource,
  Container.withPort(5432), // TypeError: withPort is not a dual!
)

// RIGHT: Full parity between method chaining and pipe composition
// Style A: Fluent method chaining
const instanceA = Container.make('postgres:16')
  .withPort(5432)
  .withMemoryLimit(512)

// Style B: Functional pipe composition
const instanceB = pipe(
  Container.make('postgres:16'),
  Container.withPort(5432),
  Container.withMemoryLimit(512),
)
```

Gate: `review` — verify the builder implements `Pipeable.Pipeable` and every combinator export is authored with `dual(2, ...)`.
