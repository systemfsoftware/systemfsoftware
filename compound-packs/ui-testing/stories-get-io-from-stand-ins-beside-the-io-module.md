---
title: The Storybook preview substitutes exactly two modules with sb.mock, the I/O layer and the router, each by a stand-in in a __mocks__ folder beside it; a story's data is the I/O layer stand-in's seed, fixture controls only steer behaviour, and nothing else is ever substituted
applies_when:
  - a story's components reach I/O, a route or a Link
  - writing or changing .storybook/preview, the I/O layer stand-in, the router stand-in, the app's fixture-controls module or the control primitives
  - deciding whether a story may mock, fake, stub or substitute a module, write an atom, or use a fixture
  - deciding where a story's data comes from, or a story needs data the screen does not show yet
  - deciding where a Storybook stand-in or a fixture control goes
  - deciding whether a stand-in needs a contract suite, or where it lives
tags: [storybook, sb-mock, io, router, stand-in, mocks-folder, fakes, fixtures, fixture-controls, seed, contract-test]
---

Applies to: every app with Storybook stories, from its first story. It binds whoever writes or reviews `.storybook/preview.tsx`, any file in a `__mocks__` folder, the control primitives, a story or a step file. Paths below are relative to the app's package root. worked-example-preview-stand-ins-story-and-contract-suite.md in this pack shows every file named here, whole.

`sb.mock` is required for exactly these two modules and forbidden for every other module:

| Module                           | Its stand-in                | What the stand-in changes                                   |
| -------------------------------- | --------------------------- | ----------------------------------------------------------- |
| `src/io/layer.ts`, the I/O layer | `src/io/__mocks__/layer.ts` | every I/O service now answers from the stand-in's own world |
| `src/router.tsx`, the router     | `src/__mocks__/router.tsx`  | browser history becomes memory history; nothing else        |

- Location: a stand-in sits in a `__mocks__` folder directly beside the module it replaces. The layer's stand-in is therefore in `src/io/__mocks__/` and the router's in `src/__mocks__/`; neither goes in the other's folder or in a shared mocks folder. Each stand-in exports every name its module exports, with the same types, and may export more. A module given to `sb.mock` with no stand-in beside it is silently automocked, and its stories test nothing.
- The router is substituted, and the substitute is the real router. `src/__mocks__/router.tsx` calls `createRouter` with the app's real generated `routeTree` and `history: createMemoryHistory({ initialEntries: ['/'] })` in place of browser history. The preview imports that router and wraps every story in `RouterContextProvider` given that router, then `LinkProvider` given the router's `Link`, so every route and Link a component reaches is real. An app with no `src/router.tsx` has no router row; nothing takes its place.
- Data: a story's data is the I/O layer stand-in's seed. The stand-in declares one fixed set of seeded records as module constants and builds a fresh world from them each time the app runtime builds it. The runtime is built once per registry, and the preview mounts a new registry for each story, so every story starts on the same seeded world. A story chooses its data in two ways only: by naming a seeded record in step text (a capture default or `with:`), which a step finds the way a person would; or by doing the person's actions in the real UI, so the stand-in writes the new record into its world. Data a story needs that the seed lacks is added to the seed. The world lives inside the runtime, never in module scope.
- Story-written state is forbidden: no story, step, decorator, loader or `beforeEach` hands the stand-in records, adds a fixture file, or writes an app atom. State a story wants that the stand-in would answer (no account, an unavailable service) is an I/O answer: it gets a named control in the fixture-controls module, set in the story's `beforeEach`, which the stand-in consults.
- Presentational components that reach no I/O take their data as `args` (props), built with the domain's own constructors. Their stories need no stand-in data and no control.
- Control primitives: the landing, fault, approval and record primitives and `resetAll()` live beside the stand-in, in `src/io/__mocks__/control-primitives.ts`, apart from the app's named controls. They are mechanism only: they import nothing else from the app and name no app noun. They move to a shared package only once a second app consumes them, and only if that package has a non-test importer; never create a package whose only importers are tests or stories.
- Fixture controls: `src/io/__mocks__/fixture-controls.ts` is a thin per-app module beside the I/O layer stand-in. It builds the app's own named controls from those primitives (`holdOrderLanding`, `setOrdersReadFault`, `notePlacedOrderId`) and re-exports `resetAll`. It is test-only steering for the stand-in, not an I/O service. A control holds behaviour (a fault, a held landing, a pending approval) or one value the stand-in produced (such as the id it just minted); it never holds the records a screen lists. It is imported only by the I/O layer stand-in and step files. The router stand-in holds no state.
- Two reset paths: `resetAll()` resets the controls; the stand-in's world and atom state reset because each story mounts a new registry, which builds a new runtime and a new world. Never rely on `resetAll()` to clear data.
- Nothing else is substituted, by `sb.mock`, `vi.mock`, a bundler or Storybook alias, or a subpath or imports-map redirect: no service, atom, hook, store, Layer, component or first-party client. Each runs its real code against the I/O layer stand-in.
- Rendering: a story renders the real app component or a component, under the preview's router stand-in. It never renders a route component outside the router, imports nothing from the app entry, built output or `tests/`, and renders no iframe whose src is a route, build directory or URL.
- Contract suite: every service the I/O layer stand-in provides is a port fake, so it runs in a contract suite at `tests/<port>.contract.integration.test.ts`, in the app's Node integration project, pairwise against the real adapter (testing pack: port-fakes-share-a-contract-suite.md). The suite reaches both sides through `src/io/layer.ts` and never imports from `__mocks__`. The suite is its own unit and lands before the first story that uses the stand-in. It is required and is never dropped as a low-value test: it is the only proof the stand-in answers as production does. The router stand-in is the real router, and the control primitives are mechanism, not a fake; neither has a contract suite.

```tsx
// WRONG: a story pushes data into a fixture module
export const Shown = { beforeEach: () => seedOrders([{ id: 'o-9', name: 'Sofa', total: 900 }]) }
// WRONG: a decorator writes an app atom to set state the I/O layer would answer
const withNoAccount: Decorator = (Story) => {
  const setAccount = useAtomSet(accountAtom)
  setAccount(AccountAnswer.None())
  return <Story />
}
// WRONG: fixture controls modelled as an I/O service
export class FixtureControls
  extends Context.Service<FixtureControls, { readonly orders: Ref.Ref<ReadonlyArray<Order>> }>()('app/FixtureControls')
{}
// WRONG: the control primitives written into the app's named-controls module
// src/io/__mocks__/fixture-controls.ts
export const makeFault = (name: string) => {/* ... */}
// WRONG: a shared package for the primitives, with one consuming app and only test importers
import { makeFault } from '@app/fixture-controls'
// WRONG: a service is substituted, so its code never runs
sb.mock(import('../src/features/orders/order.service.ts'))
// WRONG: the router is faked instead of built from the real route tree
export const router = { navigate: () => {}, state: { location: { pathname: '/' } } }

// RIGHT: .storybook/preview.tsx
import { router } from '../src/__mocks__/router'
sb.mock(import('../src/io/layer.ts')) // stand-in: src/io/__mocks__/layer.ts
sb.mock(import('../src/router.tsx')) // stand-in: src/__mocks__/router.tsx
// RIGHT: a story names a seeded record; its step finds it as a person would
export const OpensASeededOrder = f.scenario('A shopper opens an order and sees its total', {
  with: { orderName: 'Spring restock' },
}, ...steps)
// RIGHT: an I/O answer is a named control the stand-in consults, set before mount
const meta = {
  component: AccountMenu,
  beforeEach: () => {
    resetAll()
    setNoAccountAnswer(true)
    return resetAll
  },
}
```
