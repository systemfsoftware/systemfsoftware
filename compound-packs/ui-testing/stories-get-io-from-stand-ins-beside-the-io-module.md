---
title: A story gets its I/O from a stand-in beside each I/O module, loaded by sb.mock in the preview; only I/O is ever substituted
applies_when:
  - a story's components reach I/O
  - writing .storybook/preview or an I/O module's stand-in
  - deciding what a story may fake
tags: [storybook, sb-mock, io, fakes]
---

The preview substitutes each I/O module the components reach with `sb.mock(import('../src/io/<module>.ts'))`. The stand-in lives in a `__mocks__` folder beside that module (`src/io/__mocks__/<module>.ts`) and exports the same names and types as the module it replaces. Stand-ins are TypeScript files, as in the reference app (`src/io/__mocks__/layer.ts`).

Every module the preview passes to `sb.mock` has its stand-in file. Without one, Storybook automocks the module and a missing stand-in goes unnoticed.

Only an I/O module is substituted: an RPC or HTTP client, network status, storage, a clock. A service, atom, hook or component is never substituted or faked; it runs its real code against the substituted I/O. No preview or story substitutes any module by a bundler or Storybook alias, or a subpath or imports-map redirect.

The stand-ins' state lives in one fixture-controls module beside them (`src/io/__mocks__/fixture-controls.ts`). Every control registers itself when it is created, and `resetAll()` resets every registered control. The stand-ins and the journey steps import that module under one specifier, so they share its state.

A story never imports the application entry module, never renders a router-owned route or built output, and never renders an iframe whose src is a route, a build directory or a URL. A story never imports from `tests/`.

Decision test: in the diff, does any story or preview substitute a module that is not I/O, reach I/O by a path other than an `sb.mock` stand-in in the `__mocks__` folder beside the I/O module (an alias, an imports-map redirect, the app entry, a route, an iframe), pass a module to `sb.mock` that has no stand-in file, or keep stand-in state outside the one fixture-controls module? If yes, it fails.

Defect prevented: a faked service, atom, hook or component replaces the code the screen runs, so the story proves a module graph production never runs and stays green when the real wiring between components and their services breaks. A module passed to `sb.mock` without a stand-in is silently automocked, so its exports return nothing and the story tests nothing. Rendering the app entry or a route pulls in the live I/O, so a story performs real I/O. Stand-in state kept outside the one fixture-controls module escapes `resetAll()` and leaks between stories.

```typescript
// WRONG: a service is faked, so the story never runs its code
sb.mock(import('../src/features/orders/order.service.ts'))
```

```typescript
// RIGHT: .storybook/preview.tsx
sb.mock(import('../src/io/layer.ts')) // stand-in: src/io/__mocks__/layer.ts
```

Sources: owner rulings, 2026-10-24: "we do not want to mock anything other than IO otherwise it would be a FAKE test"; 2026-10-29: the reference app's pattern overrides this pack, as in the reference app's `.storybook/preview.tsx` and `src/io/__mocks__/`. Storybook, Mocking modules (https://storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-modules): a mock file "should be placed in a `__mocks__` directory next to the module you want to mock"; "If no `__mocks__` file is found, the original module's code is transformed at build-time to replace its exports with mocks or spies." Kent C. Dodds, Write tests (https://kentcdodds.com/blog/write-tests): "When you mock something you're removing all confidence in the integration between what you're testing and what's being mocked."

Gate: judge
