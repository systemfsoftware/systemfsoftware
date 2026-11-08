---
title: The Storybook preview substitutes exactly two modules with sb.mock, the I/O layer and the router, each by a stand-in in a __mocks__ folder beside it; the I/O layer stand-in owns the story data, fixture controls only steer its timing and failures, and nothing else is ever substituted
applies_when:
  - a story's components reach I/O, a route or a Link
  - writing or changing .storybook/preview, the I/O layer stand-in, the router stand-in, the app's fixture-controls module or the control-primitives package
  - deciding whether a story may mock, fake, stub or substitute a module, or use a fixture
  - deciding where a story's data comes from
  - deciding where a Storybook stand-in or a fixture control goes
  - deciding whether a stand-in needs a contract suite
tags: [storybook, sb-mock, io, router, stand-in, mocks-folder, fakes, fixtures, fixture-controls, contract-test]
---

Applies to: every app with Storybook stories, from its first story. It binds whoever writes or reviews `.storybook/preview.tsx`, any file in a `__mocks__` folder, the control-primitives package, a story or a step file. Paths below are relative to the app's package root, except `packages/fixture-controls`, which is relative to the workspace root. worked-example-preview-stand-ins-story-and-contract-suite.md in this pack shows every file named here, whole.

`sb.mock` is required for exactly these two modules and forbidden for every other module:

| Module                           | Its stand-in                | What the stand-in changes                                          |
| -------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| `src/io/layer.ts`, the I/O layer | `src/io/__mocks__/layer.ts` | every I/O service now answers from the stand-in's own seeded world |
| `src/router.tsx`, the router     | `src/__mocks__/router.tsx`  | browser history becomes memory history; nothing else               |

- Location: a stand-in sits in a `__mocks__` folder directly beside the module it replaces. The layer's stand-in is therefore in `src/io/__mocks__/` and the router's in `src/__mocks__/`; neither goes in the other's folder or in a shared mocks folder. Each stand-in exports every name its module exports, with the same types, and may export more for its contract suite. A module given to `sb.mock` with no stand-in beside it is silently automocked, and its stories test nothing.
- The router is substituted, and the substitute is the real router. `src/__mocks__/router.tsx` calls `createRouter` with the app's real generated `routeTree` and `history: createMemoryHistory({ initialEntries: ['/'] })` in place of browser history. The preview imports that router and wraps every story in `RouterContextProvider` given that router, then `LinkProvider` given the router's `Link`, so every route and Link a component reaches is real. An app with no `src/router.tsx` has no router row; nothing takes its place.
- Data: the I/O layer stand-in owns every piece of stand-in data and behaviour. It builds a fresh world each time its layer builds, seeded with what a person has before they act, and its services read and change that world. A story's data is only that world, reached by driving the real UI. No story, step, decorator or fixture module supplies data: no data passed as props, seeded into an atom, set on a fixture module or returned by a fake service (no scene fixture).
- Control primitives: the landing, fault, approval and record primitives and `resetAll()` live in their own workspace package, `packages/fixture-controls`, with its own `package.json`. It is mechanism only: it imports nothing from any app and names no app noun.
- Fixture controls: `src/io/__mocks__/fixture-controls.ts` is a thin per-app module beside the I/O layer stand-in. It builds the app's own named controls from those primitives (`holdOrderLanding`, `confirmOrderLanding`, `setOrdersUnreachableFault`) and re-exports `resetAll`. It is test-only steering for the stand-in's timing and failures: it is not an I/O service, holds no data, and is imported only by the I/O layer stand-in, step files and the stand-in's contract suite. The router stand-in holds no state.
- Nothing else is substituted, by `sb.mock`, `vi.mock`, a bundler or Storybook alias, or a subpath or imports-map redirect: no service, atom, hook, store, Layer, component or first-party client. Each runs its real code against the I/O layer stand-in. A story that needs a different timing or failure adds a named control to the fixture-controls module; it never substitutes the module that asks.
- Rendering: a story renders the real app component or a component, under the preview's router stand-in. It never renders a route component outside the router, imports nothing from the app entry, built output or `tests/`, and renders no iframe whose src is a route, build directory or URL.
- Contract suite: every service the I/O layer stand-in provides is a port fake. It therefore runs in a contract suite at `tests/io-layer.contract.test.ts`, pairwise against the real adapter, and that suite is the one test that imports from a `__mocks__` folder (testing pack: port-fakes-share-a-contract-suite.md). That suite is required and is never dropped as a low-value test: it is the only proof the stand-in answers as production does. The router stand-in is the real router, and the control-primitives package is mechanism, not a fake; neither has a contract suite.

```tsx
// WRONG: a story pushes data into a fixture module
export const Shown = { beforeEach: () => setOrders([{ id: 'order-9', item: 'Sofa' }]) }
// WRONG: fixture controls modelled as an I/O service
export class FixtureControls
  extends Context.Service<FixtureControls, { readonly orders: Ref.Ref<ReadonlyArray<Order>> }>()('app/FixtureControls')
{}
// WRONG: control primitives defined inside the app, in src/io/__mocks__/fixture-controls.ts
const controls = new Map<string, () => void>()
export const makeFault = (name: string) => {/* ... */}
// WRONG: a service is substituted, so its code never runs
sb.mock(import('../src/features/orders/order.service.ts'))
// WRONG: the router is faked instead of built from the real route tree
export const router = { navigate: () => {}, state: { location: { pathname: '/' } } }

// RIGHT: .storybook/preview.tsx
import { router } from '../src/__mocks__/router'
sb.mock(import('../src/io/layer.ts')) // stand-in: src/io/__mocks__/layer.ts
sb.mock(import('../src/router.tsx')) // stand-in: src/__mocks__/router.tsx
// RIGHT: src/io/__mocks__/fixture-controls.ts names the app's controls from the package's primitives
import { makeLanding, resetAll } from '@app/fixture-controls'
const orderLanding = makeLanding('orderLanding', ['placed'])
export const holdOrderLanding = (): void => orderLanding.hold('placed')
// RIGHT: a step steers timing, then drives the real UI; the order shown comes from the stand-in's world
export const placingIsSlow = (): void => holdOrderLanding()
```
