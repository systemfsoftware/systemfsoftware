---
title: The Storybook preview substitutes exactly two modules with sb.mock, the I/O layer and the router, each by a stand-in in a __mocks__ folder beside it; nothing else is ever substituted
applies_when:
  - a story's components reach I/O, a route or a Link
  - writing or changing .storybook/preview, the I/O layer stand-in, the router stand-in or the fixture-controls module
  - deciding whether a story may mock, fake, stub or substitute a module, or use a fixture
  - deciding where a Storybook stand-in file goes
  - deciding whether a stand-in needs a contract suite
tags: [storybook, sb-mock, io, router, stand-in, mocks-folder, fakes, fixtures, contract-test]
---

Applies to: every app with Storybook stories, from its first story. It binds whoever writes or reviews `.storybook/preview.tsx`, any file in a `__mocks__` folder, or a story. Paths below are relative to the app's package root.

`sb.mock` is required for exactly these two modules and forbidden for every other module:

| Module                           | Its stand-in (same names and types) | What the stand-in changes                              |
| -------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| `src/io/layer.ts`, the I/O layer | `src/io/__mocks__/layer.ts`         | every I/O service (RPC, HTTP, storage, network, clock) |
| `src/router.tsx`, the router     | `src/__mocks__/router.tsx`          | browser history becomes memory history; nothing else   |

- Location: a stand-in sits in a `__mocks__` folder directly beside the module it replaces. The layer's stand-in is therefore in `src/io/__mocks__/` and the router's in `src/__mocks__/`; neither goes in the other's folder or in a shared mocks folder. A module given to `sb.mock` with no stand-in beside it is silently automocked, and its stories test nothing.
- The router is substituted, and the substitute is the real router. `src/__mocks__/router.tsx` calls `createRouter` with the app's real generated `routeTree` and `history: createMemoryHistory({ initialEntries: ['/'] })` in place of browser history. The preview imports that router and wraps every story in `RouterContextProvider` given that router, then `LinkProvider` given the router's `Link`, so every route and Link a component reaches is real. An app with no `src/router.tsx` has no router row; nothing takes its place.
- State: stand-in state lives only in `src/io/__mocks__/fixture-controls.ts`. The I/O layer stand-in and journey steps import it under one specifier (the app's source alias), so they share one instance. The router stand-in holds no state.
- Nothing else is substituted, by `sb.mock`, `vi.mock`, a bundler or Storybook alias, or a subpath or imports-map redirect: no service, atom, hook, store, Layer, component or first-party client. Each runs its real code against the I/O layer stand-in. A story that needs a different answer adds a fixture control to the I/O layer stand-in; it never substitutes the module that asks.
- No scene fixture: no module or object hands a story what its components would load through I/O (a loaded page, a signed-in account, a list of orders), whether passed as props, seeded into an atom or returned by a fake service. A story's data is only what the I/O layer stand-in answers, steered by fixture controls.
- A story renders components. It never renders a router-owned route component or a page, imports nothing from the app entry, built output or `tests/`, and renders no iframe whose src is a route, build directory or URL.
- Contract suite: every service the I/O layer stand-in provides is a port fake, so it runs in its port's contract suite in the app's `tests/`, pairwise against the real adapter (testing pack: port-fakes-share-a-contract-suite.md). That suite is required and is never dropped as a low-value test: it is the only proof the stand-in answers as production does. The router stand-in is the real router, not a fake, and has no contract suite.

```tsx
// WRONG: a service is substituted, so its code never runs
sb.mock(import('../src/features/orders/order.service.ts'))
// WRONG: the router is faked instead of built from the real route tree
export const router = { navigate: () => {}, state: { location: { pathname: '/' } } }
// WRONG: a scene fixture hands the story what I/O would load
export const Loaded = { render: () => <OrderList orders={sampleOrders} /> }

// RIGHT: .storybook/preview.tsx
import { router } from '../src/__mocks__/router'
sb.mock(import('../src/io/layer.ts')) // stand-in: src/io/__mocks__/layer.ts
sb.mock(import('../src/router.tsx')) // stand-in: src/__mocks__/router.tsx
const decorators = [(Story) => (
  <RouterContextProvider router={router}>
    <LinkProvider component={Link}><Story /></LinkProvider>
  </RouterContextProvider>
)]
// RIGHT: src/__mocks__/router.tsx
export const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
// RIGHT: a story steers the I/O answer, and OrderList loads it through its real atom
beforeEach: () => { resetAll(); orders.answer([{ id: 'o-1', total: 1_250 }]); return resetAll },
```
