---
title: Callable function syntax versus interface-object syntax on ADTs
applies_when:
  - deciding whether an ADT, blueprint, or handle should be callable as a function or an interface object
  - designing invocation ergonomics for policies, deciders, workflows, and capability packages
  - structuring public handles in capability and workflow packages
tags: [cell, adt-shape, callable-syntax, interface-syntax]
---

In the Effect lineage, whether an ADT is directly callable as a function (`instance(arg)`) or modeled as an interface object with properties (`instance.method(arg)`) is governed by its semantic role:

### 1. When to Use Callable Function Syntax (`fn(input)`)

Use callable function syntax when the **primary purpose of the instance is evaluation or transformation over an input**:

- **Policies and Matchers**: A compiled policy (e.g. `evaluator(input)`) _is_ the decision function `(input: I) => Effect<A, E, R>`. Calling it is its single primary operation; properties like `.plan`, `.runWithTrace`, and `.replay` are secondary introspection handles attached to the function object.
- **Pure Decision Workflows**: A `Workflow` (e.g. `decide(command)` in `effect-cell-types`) is a branded decision function `(cmd: C) => Result<D, E>`.
- **Codecs and Decoders**: A decoder or parser is directly invocable over its raw input.

In these cases, an intermediate `.run(input)` or `.eval(input)` method is ceremonial noise. The instance _is_ the function.

### 2. When NOT to Use Callable Syntax (Use Interface + Properties)

Use an interface object with properties when the instance represents **an entity, configuration, or lifecycle-bearing value**:

- **Blueprints**: A container, database, daemon, or sandbox blueprint is a cold description with identity and compilation targets, not a mathematical function. Calling `blueprint()` makes no semantic sense; accessing `.scoped` or `.layer` explicitly communicates acquisition. Blueprints are minted with `Blueprint.make` and live in `*.blueprint.ts` modules.
- **Handles**: A live instance is an interface record minted with `Handle.make` (`running-vm.handle.ts`). Handles with multiple operations (`vm.exec(...)`, `vm.port(...)`, `vm.logs(...)`) are a dictionary of standalone operations, not a single evaluation function.
- **Immutable Configurations**: Objects whose identity consists of their fields, combinators, and compilation targets.

```ts
// WRONG: forcing a callable function on a blueprint or handle
const postgres = make('postgres:16')
const db = yield * postgres() // Nonsensical: a database blueprint is not an evaluation function

// RIGHT: interface + explicit execution targets for a blueprint
const postgres = make('postgres:16')
const db = yield * postgres.scoped // Explicit scoped acquisition
const layer = postgres.layer(Context.Key<Container>()) // Explicit layer compilation

// RIGHT: callable function syntax for decision evaluators / policies
const evaluate = Policy.make() /* ... */
const verdict = yield * evaluate(payload) // Evaluator IS the function
```

Gate: `type-checker`, `review` — a blueprint or handle is not callable, so `blueprint()` fails to compile; review that evaluators/policies use callable syntax with attached introspection properties, while blueprints and handles are interface objects with explicit lifecycle targets (`.scoped`, `.layer`) and standalone dual operations.
