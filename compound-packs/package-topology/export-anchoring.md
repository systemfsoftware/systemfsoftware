---
title: Every export is anchored to a type its module declares; a capability package publishes only five shapes
applies_when:
  - adding an exported function or constant to a published module
  - adding a helper, utility, or formatter to a package's public surface
  - publishing existing exports under a new entry or subpath
  - reviewing what a package's mod.ts or index.ts exports
  - designing the public API of a capability package
tags: [package-topology, public-surface, homeless-export, shapes, anchoring]
---

**Every package.** Each exported function or value belongs to a type its own module declares, as that type's constructor, combinator, or evaluator. `defineConfig` is the typed constructor of the config type its module declares; `Layer.empty` is a value of the `Layer` type its module declares. A standalone helper or loose constant that serves no type in its module is homeless: it makes the module a drawer with no owner. A new entry or subpath publishes every export its module carries, so each one is checked here even when it was already exported from the root.

**Capability packages** (packages that author Cells and workflows) narrow the anchor to five shapes:

| Shape  | What is exported                                                       | Earned by                                                                |
| ------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Cell   | `Cell<I, A, E, R>` and its combinators                                 | an outside interaction with input, output, and refusals                  |
| Schema | decodable contracts and smart constructors                             | an untrusted byte boundary                                               |
| Port   | `Context.Service` contracts                                            | a dependency the consumer provides                                       |
| Union  | tagged variants of closed data, with constructors and pure projections | mutually exclusive domain states                                         |
| Handle | nominal records with members, and their dual combinators               | members that cannot be serialized, such as functions or generic identity |

A capability package never publishes its workflows; the Cell is the published computation.

Inside a `*.schema.ts` file the anchor is enforced mechanically by `schema-file-exports-schemas-only`. Methods on schema classes are governed by `schema-laws/data-only-schema-classes.md`; barrel shape by `cell-architecture/single-namespace-barrel.md`.

```ts
// WRONG: homeless
export const formatMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`

// RIGHT: an evaluator of the Money type this module declares
export const Money = Schema.Number.pipe(Schema.int(), Schema.brand('Money'))
export type Money = typeof Money.Type
export const format = (money: Money): string => `$${(money / 100).toFixed(2)}`
```

Gate: `review`; `schema-file-exports-schemas-only` (oxlint, error) inside `*.schema.ts`.
