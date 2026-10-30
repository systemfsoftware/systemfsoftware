---
title: A story gets its I/O from a stand-in beside each I/O module, loaded by sb.mock in the preview; only I/O is ever substituted
applies_when:
  - a story's components reach I/O
  - writing .storybook/preview or an I/O module's stand-in
  - deciding what a story may fake
tags: [storybook, sb-mock, io, fakes]
---

Substitute each I/O module the components reach (an RPC or HTTP client, network status, storage, a clock) with `sb.mock(import('../src/io/<module>.ts'))` in the preview. Write its stand-in as a TypeScript file in a `__mocks__` folder beside the module (`src/io/__mocks__/<module>.ts`), exporting the same names and types. Give every module passed to `sb.mock` its stand-in; without one Storybook silently automocks it and the story tests nothing.

Substitute only I/O. Never fake a service, atom, hook or component: it runs its real code against the substituted I/O. Never substitute through a bundler or Storybook alias, or a subpath or imports-map redirect.

Keep the stand-ins' state in one fixture-controls module beside them (`src/io/__mocks__/fixture-controls.ts`): each control registers itself on creation and `resetAll()` resets all registered controls. Stand-ins and journey steps import it under one specifier so they share its state.

A story never imports the application entry, renders a router-owned route or built output, renders an iframe whose src is a route, build directory or URL, or imports from `tests/`; each pulls in live I/O or a second wiring.

```typescript
// WRONG: a service is faked, so the story never runs its code
sb.mock(import('../src/features/orders/order.service.ts'))
// RIGHT: .storybook/preview.tsx
sb.mock(import('../src/io/layer.ts')) // stand-in: src/io/__mocks__/layer.ts
```
