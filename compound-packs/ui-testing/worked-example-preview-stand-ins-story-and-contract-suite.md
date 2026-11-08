---
title: Wire Storybook file for file as this worked example does, with the control-primitives package, the preview, the I/O layer stand-in and its data, the app's named fixture controls, the router stand-in, a journey with its steps and the stand-in's contract suite
applies_when:
  - setting up Storybook in an app, or adding its first story or journey
  - writing or changing .storybook/preview, a file in a __mocks__ folder, a story, a step file, the control-primitives package or the I/O layer stand-in's contract suite
  - unsure what a stand-in, a fixture control, a control primitive or the router stand-in looks like in code
  - deciding where a story's data comes from
tags: [storybook, sb-mock, io, router, stand-in, fixture-controls, control-primitives, contract-test, worked-example]
---

Applies to: every app with Storybook stories. Copy these files and rename `Orders` to the app's own I/O services; keep every path, export name and wiring as shown. This file is everything needed: no other source is required to follow this pack. It puts together stories-get-io-from-stand-ins-beside-the-io-module.md and each-journey-starts-from-reset-fixture-controls.md in this pack, and port-fakes-share-a-contract-suite.md in the testing pack.

Three roles, never mixed:

- The I/O layer stand-in `src/io/__mocks__/layer.ts` owns the stand-in data and behaviour: its seeded state and what every service does with it.
- Control primitives (landing, fault, approval, record, `resetAll`) are mechanism only. They live in their own workspace package, `packages/fixture-controls`, which imports nothing from any app.
- `src/io/__mocks__/fixture-controls.ts` is a thin per-app module that names the app's own controls (`holdOrderLanding`, `setOrdersUnreachableFault`) and builds them from the primitives. It is test-only steering for the stand-in's timing and failures. It is not an I/O service and carries no data.

A story renders the real app or a component. Its steps import only `resetAll` and the named hold, confirm and fault controls. The data a story shows is the stand-in's own state, reached by driving the real UI.

## The control-primitives package

```json
// packages/fixture-controls/package.json
{
  "name": "@app/fixture-controls",
  "private": true,
  "type": "module",
  "exports": { ".": { "import": "./src/index.ts", "types": "./src/index.ts" } },
  "dependencies": { "effect": "catalog:" }
}
```

```typescript
// packages/fixture-controls/src/registry.ts: every control registers its reset; resetAll() runs them all
const controls = new Map<string, () => void>()

export const defineControl = (name: string, reset: () => void): void => {
  if (controls.has(name)) throw new Error(`fixture-controls: a control named "${name}" is already registered`)
  controls.set(name, reset)
}

export const resetAll = (): void => {
  for (const reset of controls.values()) reset()
}
```

```typescript
// packages/fixture-controls/src/landing.ts: a write that lands in named phases, each holdable and awaitable
import { Effect, Latch } from 'effect'
import { defineControl } from './registry.js'

export interface Landing {
  readonly hold: (...phases: ReadonlyArray<string>) => void
  readonly release: (phase: string) => void
  readonly isHeld: (phase: string) => boolean
  readonly awaitPhase: (phase: string) => Effect.Effect<void>
}

export const makeLanding = (name: string, phaseNames: ReadonlyArray<string>): Landing => {
  const phases = new Map(phaseNames.map((phase) => [phase, { latch: Latch.makeUnsafe(true), held: false }]))
  const phaseOf = (phase: string) => {
    const found = phases.get(phase)
    if (found === undefined) throw new Error(`fixture-controls: no such phase "${phase}"`)
    return found
  }
  defineControl(`landing:${name}`, () => {
    for (const phase of phases.values()) {
      phase.latch.openUnsafe()
      phase.held = false
    }
  })
  return {
    hold: (...names) => {
      for (const name of names) {
        const phase = phaseOf(name)
        phase.latch.closeUnsafe()
        phase.held = true
      }
    },
    release: (name) => {
      const phase = phaseOf(name)
      phase.latch.openUnsafe()
      phase.held = false
    },
    isHeld: (name) => phaseOf(name).held,
    awaitPhase: (name) => Effect.suspend(() => phaseOf(name).latch.await),
  }
}
```

```typescript
// packages/fixture-controls/src/fault.ts: a boundary that can fault, always or once
import { defineControl } from './registry.js'

export interface BoundaryFault {
  readonly arm: () => void
  readonly armOnce: () => void
  readonly disarm: () => void
  readonly consult: () => boolean
}

export const makeFault = (name: string): BoundaryFault => {
  let sticky = false
  let once = false
  defineControl(`fault:${name}`, () => {
    sticky = false
    once = false
  })
  return {
    arm: () => {
      sticky = true
    },
    armOnce: () => {
      once = true
    },
    disarm: () => {
      sticky = false
      once = false
    },
    consult: () => {
      if (once) {
        once = false
        return true
      }
      return sticky
    },
  }
}
```

```typescript
// packages/fixture-controls/src/approval.ts: a question a person answers; the boundary awaits settle
import { Deferred, Effect } from 'effect'
import { defineControl } from './registry.js'

export type ApprovalVerdict = 'granted' | 'declined'

export interface HumanApproval {
  readonly hold: () => void
  readonly approve: () => void
  readonly decline: () => void
  readonly isHeld: () => boolean
  readonly settle: Effect.Effect<ApprovalVerdict>
}

export const makeApproval = (name: string): HumanApproval => {
  let verdict: ApprovalVerdict = 'granted'
  let pending: Deferred.Deferred<ApprovalVerdict> | null = null
  const answer = (value: ApprovalVerdict): void => {
    verdict = value
    if (pending !== null) Deferred.doneUnsafe(pending, Effect.succeed(value))
    pending = null
  }
  defineControl(`approval:${name}`, () => {
    verdict = 'granted'
    pending = null
  })
  return {
    hold: () => {
      pending = Deferred.makeUnsafe<ApprovalVerdict>()
    },
    approve: () => answer('granted'),
    decline: () => answer('declined'),
    isHeld: () => pending !== null,
    settle: Effect.suspend(() => pending !== null ? Deferred.await(pending) : Effect.succeed(verdict)),
  }
}
```

```typescript
// packages/fixture-controls/src/record.ts: a valued slot, restored to its creation value on reset or take
import { defineControl } from './registry.js'

export interface ValuedRecord<A> {
  readonly set: (value: A) => void
  readonly get: () => A
  readonly take: () => A
}

export const makeRecord = <A>(name: string, initial: A): ValuedRecord<A> => {
  let current = initial
  defineControl(`record:${name}`, () => {
    current = initial
  })
  return {
    set: (value) => {
      current = value
    },
    get: () => current,
    take: () => {
      const taken = current
      current = initial
      return taken
    },
  }
}
```

```typescript
// packages/fixture-controls/src/index.ts
export { makeApproval } from './approval.js'
export type { ApprovalVerdict, HumanApproval } from './approval.js'
export { makeFault } from './fault.js'
export type { BoundaryFault } from './fault.js'
export { makeLanding } from './landing.js'
export type { Landing } from './landing.js'
export { makeRecord } from './record.js'
export type { ValuedRecord } from './record.js'
export { resetAll } from './registry.js'
```

The package holds no app noun and no test: its primitives are Effect's `Latch` and `Deferred`, and a control that leaks between stories fails a story, which is where it is caught.

## The app's production code, which stories run unchanged

```typescript
// src/config.ts: the one setting the orders adapter reads (configuration pack)
import { Config, Context, Effect, Layer, Schema as S } from 'effect'

export const VITE_ORDERS_URL = Config.schema(
  S.String.annotate({ description: 'Base URL of the orders API' }),
  'VITE_ORDERS_URL',
)

export class OrdersConfig extends Context.Service<OrdersConfig, { readonly baseUrl: string }>()('app/OrdersConfig') {
  static readonly layer = Layer.effect(
    OrdersConfig,
    Effect.gen(function*() {
      return OrdersConfig.of({ baseUrl: yield* VITE_ORDERS_URL })
    }),
  )
}
```

```typescript
// src/io/orders.client.ts: one I/O service and its real adapter
import { OrdersConfig } from '@/config'
import { Context, Data, Effect, Layer } from 'effect'

export interface Order {
  readonly id: string
  readonly item: string
}
export class OrdersUnreachable extends Data.TaggedError('OrdersUnreachable') {}

export class OrdersClient extends Context.Service<OrdersClient, {
  readonly list: () => Effect.Effect<ReadonlyArray<Order>, OrdersUnreachable>
  readonly place: (item: string) => Effect.Effect<Order, OrdersUnreachable>
}>()('app/io/OrdersClient') {}

export const OrdersClientLive = Layer.effect(
  OrdersClient,
  Effect.gen(function*() {
    const { baseUrl } = yield* OrdersConfig
    const call = <A>(init?: RequestInit) =>
      Effect.tryPromise({
        try: (signal) => fetch(`${baseUrl}/orders`, { ...init, signal }).then((r) => r.json() as Promise<A>),
        catch: () => new OrdersUnreachable(),
      })
    return OrdersClient.of({
      list: () => call<ReadonlyArray<Order>>(),
      place: (item) => call<Order>({ method: 'POST', body: JSON.stringify({ item }) }),
    })
  }),
)
```

```typescript
// src/io/layer.ts: the I/O layer, the one module that builds every I/O service
import { OrdersConfig } from '@/config'
import { Layer } from 'effect'
import { OrdersClientLive } from './orders.client'

export const ServiceLayer = Layer.mergeAll(OrdersClientLive).pipe(Layer.provide(OrdersConfig.layer))
export type ServiceLayer = typeof ServiceLayer
```

```typescript
// src/runtime.ts and src/features/orders/orders.atom.ts: atoms reach I/O only through the I/O layer
import { ServiceLayer } from '@/io/layer'
import { OrdersClient } from '@/io/orders.client'
import { Effect } from 'effect'
import * as Atom from 'effect/reactivity/Atom'

export const appRuntime = Atom.runtime(ServiceLayer)

export const ordersAtom = appRuntime.atom(Effect.gen(function*() {
  const orders = yield* OrdersClient
  return yield* orders.list()
})).pipe(Atom.withReactivity(['orders']))

export const placeOrderAtom = appRuntime.fn((item: string) =>
  Effect.gen(function*() {
    const orders = yield* OrdersClient
    return yield* orders.place(item)
  }), { reactivityKeys: ['orders'] })
```

```tsx
// src/features/orders/OrdersPanel.tsx: the component under test
import { useAtomSet, useAtomValue } from '@effect/atom-react'
import { ordersAtom, placeOrderAtom } from './orders.atom'

export function OrdersPanel() {
  const orders = useAtomValue(ordersAtom)
  const placing = useAtomValue(placeOrderAtom)
  const placeOrder = useAtomSet(placeOrderAtom)
  return (
    <section aria-label='Your orders'>
      {orders._tag === 'Success' && (
        <ul aria-label='Orders'>{orders.value.map((order) => <li key={order.id}>{order.item}</li>)}</ul>
      )}
      {orders._tag === 'Failure' && <p role='alert'>We could not load your orders</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          placeOrder(String(new FormData(event.currentTarget).get('item')))
        }}
      >
        <label>
          Item <input name='item' />
        </label>
        <button type='submit'>Place order</button>
      </form>
      {placing.waiting && <p role='status'>Placing your order</p>}
      {placing._tag === 'Failure' && <p role='alert'>We could not place your order</p>}
    </section>
  )
}
```

```typescript
// src/router.tsx: the real router, on browser history
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({ routeTree, defaultPreload: 'intent' })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

## The Storybook files

1. `.storybook/preview.tsx`: the two `sb.mock` calls, and the decorator that wraps every story in the registry, the real router and `LinkProvider`. Add `Theme` and the global stylesheet as the design-system pack's roots-load-styles-and-providers.md says.

```tsx
import { LinkProvider } from '@astryxdesign/core/Link'
import { RegistryProvider } from '@effect/atom-react'
import { definePreview } from '@storybook/react-vite'
import { Link, RouterContextProvider } from '@tanstack/react-router'
import { sb } from 'storybook/test'
import { router } from '../src/__mocks__/router'

sb.mock(import('../src/io/layer.ts'))
sb.mock(import('../src/router.tsx'))

export default definePreview({
  decorators: [
    (Story) => (
      <RegistryProvider>
        <RouterContextProvider router={router}>
          <LinkProvider component={Link}>
            <Story />
          </LinkProvider>
        </RouterContextProvider>
      </RegistryProvider>
    ),
  ],
  parameters: { a11y: { test: 'error' } },
})
```

2. `src/io/__mocks__/fixture-controls.ts`: the app's named controls, built from the primitives. It carries no data and is no I/O service; only the stand-in, step files and the stand-in's contract suite import it.

```typescript
import { makeFault, makeLanding, resetAll } from '@app/fixture-controls'

export { resetAll }

// A placed order lands in one phase; holding it keeps the order "being placed".
const orderLanding = makeLanding('orderLanding', ['placed'])
export const holdOrderLanding = (): void => orderLanding.hold('placed')
export const confirmOrderLanding = (): void => orderLanding.release('placed')
export const awaitOrderLanding = orderLanding.awaitPhase('placed')

// The orders boundary can fault.
const ordersFault = makeFault('ordersUnreachable')
export const setOrdersUnreachableFault = (unreachable: boolean): void =>
  unreachable ? ordersFault.arm() : ordersFault.disarm()
export const ordersUnreachableFault = (): boolean => ordersFault.consult()
```

3. `src/io/__mocks__/layer.ts`: the I/O layer stand-in. It owns the stand-in data: a world built fresh each time the layer builds, seeded with what a person has before they act. It exports every name `src/io/layer.ts` exports, with the same type, builds each service through its real `Context.Service`, and asks the fixture controls only when to land and whether to fault. It may export more (`makeWorld`, `OrdersClientStandIn`) for its contract suite.

```typescript
import { awaitOrderLanding, ordersUnreachableFault } from '@/io/__mocks__/fixture-controls'
import type { ServiceLayer as IOLayer } from '@/io/layer'
import { type Order, OrdersClient, OrdersUnreachable } from '@/io/orders.client'
import { Effect, Layer, Ref } from 'effect'

const SEEDED_ORDERS: ReadonlyArray<Order> = [{ id: 'order-1', item: 'Desk lamp' }]

export const makeWorld = Effect.gen(function*() {
  return {
    orders: yield* Ref.make(SEEDED_ORDERS),
    nextId: yield* Ref.make(SEEDED_ORDERS.length + 1),
  }
})
export type World = Effect.Success<typeof makeWorld>

const boundary = Effect.suspend(() => ordersUnreachableFault() ? Effect.fail(new OrdersUnreachable()) : Effect.void)

export const OrdersClientStandIn = (world: World) =>
  Layer.succeed(
    OrdersClient,
    OrdersClient.of({
      list: () => boundary.pipe(Effect.andThen(Ref.get(world.orders))),
      place: (item) =>
        Effect.gen(function*() {
          yield* boundary
          yield* awaitOrderLanding
          const order = { id: `order-${yield* Ref.getAndUpdate(world.nextId, (n) => n + 1)}`, item }
          yield* Ref.update(world.orders, (orders) => [...orders, order])
          return order
        }),
    }),
  )

export const ServiceLayer: IOLayer = Layer.unwrap(Effect.map(makeWorld, OrdersClientStandIn))
```

4. `src/__mocks__/router.tsx`: the router stand-in. It is the real router from the real generated route tree; only the history is memory history instead of browser history. It holds no state.

```typescript
import { routeTree } from '@/routeTree.gen'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'

export const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ['/'] }),
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

5. `features/steps/placing-an-order.ts` and `features/placing-an-order.stories.tsx`: a journey and its steps. The story renders the real component (the real `App` works the same way). The steps drive the real UI and read what a person sees. They import from `__mocks__` only `resetAll` and the named controls, to steer timing and failure. The seeded order and the placed order both come from the stand-in's world.

```typescript
// features/steps/placing-an-order.ts
import { holdOrderLanding, resetAll, setOrdersUnreachableFault } from '@/io/__mocks__/fixture-controls'
import type { StepContext } from '@systemfsoftware/storybook-gherkin'
import { within } from 'storybook/test'

export async function theirOrdersAreShown(ctx: StepContext): Promise<void> {
  resetAll()
  await ctx.canvas.findByRole('list', { name: 'Orders' })
}
export const placingIsSlow = (): void => holdOrderLanding()
export const ordersCannotBeReached = (): void => setOrdersUnreachableFault(true)

export async function theyPlaceAnOrder(ctx: StepContext): Promise<void> {
  await ctx.userEvent.type(ctx.canvas.getByRole('textbox', { name: 'Item' }), 'Reading chair')
  await ctx.userEvent.click(ctx.canvas.getByRole('button', { name: 'Place order' }))
}
export async function theOrderJoinsTheirList(ctx: StepContext): Promise<void> {
  const list = ctx.canvas.getByRole('list', { name: 'Orders' })
  await ctx.expect(await within(list).findByText('Reading chair')).toBeVisible()
  await ctx.expect(within(list).getByText('Desk lamp')).toBeVisible()
}
export async function theyAreToldItIsBeingPlaced(ctx: StepContext): Promise<void> {
  await ctx.expect(await ctx.canvas.findByRole('status')).toHaveTextContent('Placing your order')
}
export async function theyAreToldItFailed(ctx: StepContext): Promise<void> {
  await ctx.expect(await ctx.canvas.findByRole('alert')).toHaveTextContent('We could not place your order')
}
```

```tsx
// features/placing-an-order.stories.tsx
import { OrdersPanel } from '@/features/orders/OrdersPanel'
import type { StoryObj } from '@storybook/react-vite'
import { feature, Given, Then, When } from '@systemfsoftware/storybook-gherkin'
import {
  ordersCannotBeReached,
  placingIsSlow,
  theirOrdersAreShown,
  theOrderJoinsTheirList,
  theyAreToldItFailed,
  theyAreToldItIsBeingPlaced,
  theyPlaceAnOrder,
} from './steps/placing-an-order'

const meta = { title: 'Journeys/Placing an order', component: OrdersPanel }
export default meta
type Story = StoryObj<typeof meta>

const f = feature(meta, {})

export const ANewOrderJoinsTheList: Story = f.scenario(
  'A person who places an order sees it join their orders',
  Given`their orders are shown`(theirOrdersAreShown),
  When`they place an order`(theyPlaceAnOrder),
  Then`the order joins their orders`(theOrderJoinsTheirList),
)

export const APendingOrderIsAnnounced: Story = f.scenario(
  'A person whose order is still being placed is told so',
  Given`their orders are shown`(theirOrdersAreShown),
  Given`placing an order is slow`(placingIsSlow),
  When`they place an order`(theyPlaceAnOrder),
  Then`they are told the order is being placed`(theyAreToldItIsBeingPlaced),
)

export const AFailedOrderIsReported: Story = f.scenario(
  'A person whose order cannot be placed is told so',
  Given`their orders are shown`(theirOrdersAreShown),
  Given`orders cannot be reached`(ordersCannotBeReached),
  When`they place an order`(theyPlaceAnOrder),
  Then`they are told the order could not be placed`(theyAreToldItFailed),
)
```

6. `tests/io-layer.contract.test.ts`: the contract suite. It is required because every service the I/O layer stand-in provides is a port fake. It is the one test that imports from a `__mocks__` folder, by the app's source alias. Each scenario runs one workload on the stand-in, with a fresh world, and on the real adapter, then expects the requirement's value from both. The real side talks to the app's real orders backend, which `tests/__fixtures__/orders-backend.ts` starts in a container and whose URL it provides (integration-testing pack). The router stand-in is the real router, and the control-primitives package is mechanism, not a fake; neither needs a suite.

```typescript
import { OrdersConfig } from '@/config'
import { resetAll, setOrdersUnreachableFault } from '@/io/__mocks__/fixture-controls'
import { makeWorld, OrdersClientStandIn } from '@/io/__mocks__/layer'
import { OrdersClient, OrdersClientLive, OrdersUnreachable } from '@/io/orders.client'
import { Gherkin, Given, it, makeFeature, pairwiseFor, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Result } from 'effect'
import { OrdersBackend } from './__fixtures__/orders-backend'

const Feature = makeFeature({ it })

const standIn = Layer.unwrap(Effect.map(makeWorld, OrdersClientStandIn))
const realAt = (baseUrl: string) =>
  OrdersClientLive.pipe(Layer.provide(Layer.succeed(OrdersConfig, OrdersConfig.of({ baseUrl }))))

const Reachable = pairwiseFor({
  a: { name: 'stand-in', layer: standIn },
  b: { name: 'real', layer: Layer.unwrap(Effect.map(OrdersBackend.url, realAt)) },
}, OrdersClient)

const Unreachable = pairwiseFor({
  a: { name: 'stand-in', layer: standIn },
  b: { name: 'real', layer: realAt('http://127.0.0.1:9') }, // nothing listens there
}, OrdersClient)

const placeThenFind = (orders: OrdersClient['Service']) =>
  Effect.gen(function*() {
    const placed = yield* orders.place('Reading chair')
    const listed = yield* orders.list()
    return listed.some((order) => order.id === placed.id && order.item === 'Reading chair')
  })

Feature('Placing and listing orders')
  .withLayer(OrdersBackend.layer)
  .body(({ scenario }) => {
    scenario(
      'An order that was placed is in the list',
      Gherkin.Do.pipe(
        Given('no control is set')(() => Effect.sync(resetAll)),
        Reachable('an order is placed and the orders are listed')('found', () => placeThenFind),
        Then('both list the placed order')(({ found }, expect) => expect([found.a, found.b]).toEqual([true, true])),
      ),
    )
    scenario(
      'Orders that cannot be reached are reported as unreachable',
      Gherkin.Do.pipe(
        Given('the orders cannot be reached')(() =>
          Effect.sync(() => {
            resetAll()
            setOrdersUnreachableFault(true)
          })
        ),
        Unreachable('the orders are listed')('listed', () => (orders) => Effect.result(orders.list())),
        Then('both report the orders as unreachable')(({ listed }, expect) =>
          expect([listed.a, listed.b]).toEqual([
            Result.fail(new OrdersUnreachable()),
            Result.fail(new OrdersUnreachable()),
          ])
        ),
      ),
    )
  })
```

## WRONG

```typescript
// WRONG: a story pushes data into a fixture module
export const Shown = { beforeEach: () => setOrders([{ id: 'order-9', item: 'Sofa' }]) }
// WRONG: fixture controls modelled as an I/O service
export class FixtureControls
  extends Context.Service<FixtureControls, { readonly orders: Ref.Ref<ReadonlyArray<Order>> }>()('app/FixtureControls')
{}
// WRONG: control primitives defined inside the app, in src/io/__mocks__/fixture-controls.ts
const controls = new Map<string, () => void>()
export const makeFault = (name: string) => {/* ... */}
```
