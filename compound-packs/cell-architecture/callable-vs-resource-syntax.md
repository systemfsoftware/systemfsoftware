---
title: Callable function syntax versus resource interface syntax on ADTs
applies_when:
  - deciding whether an ADT or builder should be callable as a function or an interface object
  - designing invocation ergonomics for policies, deciders, workflows, and resources
  - structuring public handles in capability and workflow packages
tags: [cell, adt-shape, callable-syntax, interface-syntax]
---

In the Effect lineage, whether an ADT is directly callable as a function (`instance(arg)`) or modeled as an interface with properties (`instance.method(arg)`) is governed by its semantic role:

### 1. When to Use Callable Function Syntax (`fn(input)`)

Use callable function syntax when the **primary purpose of the instance is evaluation or transformation over an input**:

- **Policies and Matchers**: A compiled policy (e.g. `evaluator(input)`) _is_ the decision function `(input: I) => Effect<A, E, R>`. Calling it is its single primary operation; properties like `.plan`, `.runWithTrace`, and `.replay` are secondary introspection handles attached to the function object.
- **Pure Decision Workflows**: A `Workflow` (e.g. `decide(command)` in `effect-cell-types`) is a branded decision function `(cmd: C) => Result<D, E>`.
- **Codecs and Decoders**: A decoder or parser is directly invocable over its raw input.

In these cases, an intermediate `.run(input)` or `.eval(input)` method is ceremonial noise. The instance _is_ the function.

### 2. When NOT to Use Callable Syntax (Use Interface + Properties)

Use an interface object with properties when the instance represents **an entity, configuration, or lifecycle-bearing resource**:

- **Resources and Sandboxes**: A database, container, daemon, socket, or `Scope` is an active entity with lifecycle and identity, not a mathematical function. Calling `resource()` makes no semantic sense; accessing `.scoped` or `.layer` explicitly communicates resource acquisition.
- **Immutable Configurations and Builders**: Objects whose identity consists of their fields, combinators, and compilation targets.
- **Handles with Multiple Operations**: When an acquired resource exposes distinct capabilities (e.g. `vm.exec(...)`, `vm.port(...)`, `vm.logs(...)`), it is an object dictionary of operations, not a single evaluation function.

```ts
// WRONG: Forcing a callable function on an entity/resource
const postgres = Database.make('postgres:16')
const db = yield* postgres() // Nonsensical: a database is not an evaluation function

// RIGHT: Interface + explicit execution properties for resources
const postgres = Database.make('postgres:16')
const db = yield* postgres.scoped // Explicit scoped acquisition
const layer = postgres.layer      // Explicit layer compilation

// RIGHT: Callable function syntax for decision evaluators / policies
const evaluate = Policy.make(...)
const verdict = yield* evaluate(payload) // Evaluator IS the function
```

Gate: `review` — verify evaluators/policies use callable syntax with attached introspection properties, while resources and entities use interface objects with explicit lifecycle properties (`.scoped`, `.layer`).
