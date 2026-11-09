---
title: Wire Storybook file for file as this worked example does, with the control primitives, the preview, the I/O layer stand-in and its seed, the app's named fixture controls, the router stand-in, journeys with their steps, a presentational story and the stand-in's contract suite
applies_when:
  - setting up Storybook in an app, or adding its first story or journey
  - writing or changing .storybook/preview, a file in a __mocks__ folder, a story, a step file, the control primitives or the I/O layer stand-in's contract suite
  - unsure what a stand-in, its seed, a fixture control, a control primitive or the router stand-in looks like in code
  - deciding where a story's data comes from
tags: [storybook, sb-mock, io, router, stand-in, seed, fixture-controls, control-primitives, contract-test, worked-example]
---

Applies to: every app with Storybook stories. Copy these files and rename `Orders` to the app's own I/O services; keep every path, export name and wiring as shown. This file is everything needed: no other source is required to follow this pack. It puts together stories-get-io-from-stand-ins-beside-the-io-module.md and each-journey-starts-from-reset-fixture-controls.md in this pack, and port-fakes-share-a-contract-suite.md in the testing pack.

Who holds what:

- Data: the I/O layer stand-in `src/io/__mocks__/layer.ts` declares the seeded records and builds a fresh world from them each time the app runtime builds it. Each story mounts a new registry, so each story starts on the same seed. A story chooses its data by naming a seeded record in step text, or by doing the person's actions in the real UI. No story, step or decorator hands the stand-in records or writes an app atom. Data the seed lacks is added to the seed.
- Behaviour: control primitives (landing, fault, approval, record, `resetAll`) are mechanism only, in `src/io/__mocks__/control-primitives.ts` beside the stand-in; they move to a shared package only once a second app consumes them and that package has a non-test importer. `src/io/__mocks__/fixture-controls.ts` names the app's controls from them. A control holds behaviour (a fault, a held landing) or one value the stand-in produced (the id it just minted), never the records a screen lists. It is not an I/O service.
- Props: a presentational component that reaches no I/O takes its data as `args`, built with the domain's own constructors.

Two reset paths: `resetAll()` resets the controls; the new registry per story resets the world and atom state.

## The control primitives, beside the stand-in

`src/io/__mocks__/control-primitives.ts` holds the mechanism every named control is built from. It names no app noun and imports nothing else from the app. It stays here, beside the stand-in, until a second app consumes it; it then moves to a shared package only if that package has a non-test importer. It carries no test: its primitives are Effect's `Latch` and `Deferred`, and a control that leaks between stories fails a story, which is where it is caught.

```typescript
// src/io/__mocks__/control-primitives.ts
import { Deferred, Effect, Latch } from 'effect'

// The registry: every control registers its reset when it is created; resetAll() runs them all.
const controls = new Map<string, () => void>()

const defineControl = (name: string, reset: () => void): void => {
  if (controls.has(name)) throw new Error(`control-primitives: a control named "${name}" is already registered`)
  controls.set(name, reset)
}

export const resetAll = (): void => {
  for (const reset of controls.values()) reset()
}

// A write that lands in named phases, each holdable and awaitable.
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
    if (found === undefined) throw new Error(`control-primitives: no such phase "${phase}"`)
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

// A boundary that can fault, always or once.
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

// A question a person answers; the boundary awaits settle.
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

// One value the stand-in produced, restored to its creation value on reset or take.
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

export class Order extends Data.Class<{ readonly id: string; readonly item: string }> {}
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
      list: () => call<ReadonlyArray<Order>>().pipe(Effect.map((rows) => rows.map((row) => new Order(row)))),
      place: (item) =>
        call<Order>({ method: 'POST', body: JSON.stringify({ item }) }).pipe(Effect.map((row) => new Order(row))),
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
// src/runtime.ts and src/features/orders/orders.atom.ts: one runtime per registry; atoms reach I/O only through the I/O layer
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
// src/features/orders/OrderRow.tsx: presentational, reaches no I/O
import type { Order } from '@/io/orders.client'

export function OrderRow({ order }: { readonly order: Order }) {
  return <li>{order.item}</li>
}
```

```tsx
// src/features/orders/OrdersPanel.tsx: the component under test, which reaches I/O through its atoms
import { useAtomSet, useAtomValue } from '@effect/atom-react'
import { OrderRow } from './OrderRow'
import { ordersAtom, placeOrderAtom } from './orders.atom'

export function OrdersPanel() {
  const orders = useAtomValue(ordersAtom)
  const placing = useAtomValue(placeOrderAtom)
  const placeOrder = useAtomSet(placeOrderAtom)
  return (
    <section aria-label='Your orders'>
      {orders._tag === 'Success' && (
        <ul aria-label='Orders'>{orders.value.map((order) => <OrderRow key={order.id} order={order} />)}</ul>
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

1. `.storybook/preview.tsx`: the two `sb.mock` calls, and the decorator that wraps every story in a new registry, the real router and `LinkProvider`. The new registry per story is what gives each story a new runtime and a fresh world. Add `Theme` and the global stylesheet as the design-system pack's roots-load-styles-and-providers.md says.

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

2. `src/io/__mocks__/fixture-controls.ts`: the app's named controls, built from the primitives. Each holds behaviour, or one value the stand-in produced. It holds no records and is no I/O service; only the stand-in and step files import it.

```typescript
import { makeFault, makeLanding, makeRecord, resetAll } from './control-primitives'

export { resetAll }

// A placed order lands in one phase; holding it keeps the order "being placed".
const orderLanding = makeLanding('orderLanding', ['placed'])
export const holdOrderLanding = (): void => orderLanding.hold('placed')
export const confirmOrderLanding = (): void => orderLanding.release('placed')
export const awaitOrderLanding = orderLanding.awaitPhase('placed')

// The orders boundary can fault on read and on write.
const ordersRead = makeFault('ordersRead')
export const setOrdersReadFault = (on: boolean): void => on ? ordersRead.arm() : ordersRead.disarm()
export const ordersReadFault = (): boolean => ordersRead.consult()
const ordersWrite = makeFault('ordersWrite')
export const setOrdersWriteFault = (on: boolean): void => on ? ordersWrite.arm() : ordersWrite.disarm()
export const ordersWriteFault = (): boolean => ordersWrite.consult()

// One value the stand-in produced: the id it just minted. The stand-in writes it.
const lastPlacedOrderId = makeRecord<string | null>('lastPlacedOrderId', null)
export const notePlacedOrderId = (id: string): void => lastPlacedOrderId.set(id)
export const takePlacedOrderId = (): string | null => lastPlacedOrderId.take()
```

3. `src/io/__mocks__/layer.ts`: the I/O layer stand-in. It declares the seed and builds a fresh world from it each time the runtime builds the layer; the world never lives in module scope. It exports every name `src/io/layer.ts` exports, with the same type, builds each service through its real `Context.Service`, and asks the controls only when to land and whether to fault. A story that needs a record the seed lacks adds it to `SEEDED_ORDERS`.

```typescript
import {
  awaitOrderLanding,
  notePlacedOrderId,
  ordersReadFault,
  ordersWriteFault,
} from '@/io/__mocks__/fixture-controls'
import type { ServiceLayer as IOLayer } from '@/io/layer'
import { Order, OrdersClient, OrdersUnreachable } from '@/io/orders.client'
import { Effect, Layer, Ref } from 'effect'

const SEEDED_ORDERS: ReadonlyArray<Order> = [
  new Order({ id: 'order-1', item: 'Desk lamp' }),
  new Order({ id: 'order-2', item: 'Bookshelf' }),
]

const makeWorld = Effect.gen(function*() {
  return {
    orders: yield* Ref.make(SEEDED_ORDERS),
    nextId: yield* Ref.make(SEEDED_ORDERS.length + 1),
  }
})
type World = Effect.Success<typeof makeWorld>

const faultWhen = (faulted: () => boolean) =>
  Effect.suspend(() => faulted() ? Effect.fail(new OrdersUnreachable()) : Effect.void)

const OrdersClientStandIn = (world: World) =>
  Layer.succeed(
    OrdersClient,
    OrdersClient.of({
      list: () => faultWhen(ordersReadFault).pipe(Effect.andThen(Ref.get(world.orders))),
      place: (item) =>
        Effect.gen(function*() {
          yield* faultWhen(ordersWriteFault)
          yield* awaitOrderLanding
          const order = new Order({ id: `order-${yield* Ref.getAndUpdate(world.nextId, (n) => n + 1)}`, item })
          yield* Ref.update(world.orders, (orders) => [...orders, order])
          notePlacedOrderId(order.id)
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

5. `features/steps/placing-an-order.ts` and `features/placing-an-order.stories.tsx`: a journey and its steps. The story renders the real component (the real `App` works the same way). The journey names a seeded order in its step text, and the new order exists because the person placed it in the real UI. Steps import from `__mocks__` only `resetAll` and the named controls, to steer timing and failure.

```typescript
// features/steps/placing-an-order.ts
import { holdOrderLanding, resetAll, setOrdersWriteFault } from '@/io/__mocks__/fixture-controls'
import { capture } from '@systemfsoftware/storybook-gherkin'
import type { StepContext } from '@systemfsoftware/storybook-gherkin'
import { within } from 'storybook/test'

export const existingOrder = capture('existingOrder', { default: 'Desk lamp' }) // a record in SEEDED_ORDERS
export const newItem = capture('newItem', { default: 'Reading chair' })

export async function theirOrdersAreShown(
  ctx: StepContext,
  { existingOrder }: { readonly existingOrder: string },
): Promise<void> {
  resetAll()
  const list = await ctx.canvas.findByRole('list', { name: 'Orders' })
  await ctx.expect(within(list).getByText(existingOrder)).toBeVisible()
}
export const placingIsSlow = (): void => holdOrderLanding()
export const ordersCannotBeWritten = (): void => setOrdersWriteFault(true)

export async function theyPlaceAnOrder(ctx: StepContext, { newItem }: { readonly newItem: string }): Promise<void> {
  await ctx.userEvent.type(ctx.canvas.getByRole('textbox', { name: 'Item' }), newItem)
  await ctx.userEvent.click(ctx.canvas.getByRole('button', { name: 'Place order' }))
}
export async function theOrderJoinsTheirList(
  ctx: StepContext,
  caps: { readonly existingOrder: string; readonly newItem: string },
): Promise<void> {
  const list = ctx.canvas.getByRole('list', { name: 'Orders' })
  await ctx.expect(await within(list).findByText(caps.newItem)).toBeVisible()
  await ctx.expect(within(list).getByText(caps.existingOrder)).toBeVisible()
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
  existingOrder,
  newItem,
  ordersCannotBeWritten,
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
  'A person who places an order sees it beside the orders they already had',
  Given`their orders, including ${existingOrder}, are shown`(theirOrdersAreShown),
  When`they place an order for ${newItem}`(theyPlaceAnOrder),
  Then`${newItem} joins their orders`(theOrderJoinsTheirList),
)

export const APendingOrderIsAnnounced: Story = f.scenario(
  'A person whose order is still being placed is told so',
  Given`their orders, including ${existingOrder}, are shown`(theirOrdersAreShown),
  Given`placing an order is slow`(placingIsSlow),
  When`they place an order for ${newItem}`(theyPlaceAnOrder),
  Then`they are told the order is being placed`(theyAreToldItIsBeingPlaced),
)

export const AFailedOrderIsReported: Story = f.scenario(
  'A person whose order cannot be placed is told so',
  Given`their orders, including ${existingOrder}, are shown`(theirOrdersAreShown),
  Given`orders cannot be saved`(ordersCannotBeWritten),
  When`they place an order for ${newItem}`(theyPlaceAnOrder),
  Then`they are told the order could not be placed`(theyAreToldItFailed),
)
```

6. `features/seeing-orders.stories.tsx`: state the I/O layer would answer, read while the component mounts, is a named control set in the meta's `beforeEach`. It is never an atom a story or decorator writes.

```tsx
import { OrdersPanel } from '@/features/orders/OrdersPanel'
import { resetAll, setOrdersReadFault } from '@/io/__mocks__/fixture-controls'
import type { StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

const meta = {
  title: 'Journeys/Seeing orders',
  component: OrdersPanel,
  beforeEach: () => {
    resetAll()
    setOrdersReadFault(true)
    return resetAll
  },
}
export default meta

export const OrdersThatCannotBeReadAreReported: StoryObj<typeof meta> = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('We could not load your orders')
  },
}
```

7. `src/features/orders/OrderRow.stories.tsx`: a presentational component that reaches no I/O takes `args`, built with the domain's own constructor. No stand-in data and no control.

```tsx
import { Order } from '@/io/orders.client'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { OrderRow } from './OrderRow'

const meta = { component: OrderRow, args: { order: new Order({ id: 'order-1', item: 'Desk lamp' }) } } satisfies Meta<
  typeof OrderRow
>
export default meta

export const ShowsTheItem: StoryObj<typeof meta> = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('listitem')).toHaveTextContent('Desk lamp')
  },
}
```

8. `tests/orders.contract.integration.test.ts`: the contract suite. It is required because every service the I/O layer stand-in provides is a port fake. It is its own unit and lands before the first story that uses the stand-in. It runs in the app's Node integration project, not in Storybook. It reaches both sides through the I/O module's own specifier: `vi.mock` with no factory loads the stand-in beside it, and `vi.importActual` of the same specifier loads the real module, so the test never imports from `__mocks__` and nothing on the real side is mocked. The real module runs in the test's process against the real backend, which `tests/__fixtures__/orders-backend.ts` starts in a container and whose URL it provides; the URL reaches the real module through `Config` (integration-testing pack). Each scenario reads only what it created through the port on both sides, and never compares the stand-in's seed with an empty real store. Every operation of the port appears in at least one scenario. The router stand-in is the real router, and the control primitives are mechanism, not a fake; neither needs a suite.

```typescript
import { vi } from 'vitest'
vi.mock('../src/io/layer.ts') // no factory: loads src/io/__mocks__/layer.ts, the stand-in

import { Gherkin, it, makeFeature, pairwiseFor, Then } from '@systemfsoftware/effect-gherkin-spec'
import { ConfigProvider, Effect, Layer } from 'effect'
import { ServiceLayer as StandIn } from '../src/io/layer.ts' // the stand-in, reached through the real specifier
import { OrdersClient } from '../src/io/orders.client.ts'
import { OrdersBackend } from './__fixtures__/orders-backend'

const Real = await vi.importActual<typeof import('../src/io/layer.ts')>('../src/io/layer.ts')
const realAt = (url: string) =>
  Real.ServiceLayer.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ VITE_ORDERS_URL: url }))))

const Pairwise = pairwiseFor({
  a: { name: 'stand-in', layer: StandIn },
  b: { name: 'real', layer: Layer.unwrap(Effect.map(OrdersBackend.url, realAt)) },
}, OrdersClient)

const Feature = makeFeature({ it })

Feature('Placing and listing orders')
  .withLayer(OrdersBackend.layer)
  .body(({ scenario }) => {
    scenario(
      'An order that was placed is in the list',
      Gherkin.Do.pipe(
        Pairwise('the order is placed and the orders are listed')('found', () => (orders) =>
          Effect.gen(function*() {
            const placed = yield* orders.place('Reading chair')
            const listed = yield* orders.list()
            return listed.some((order) => order.id === placed.id && order.item === 'Reading chair')
          })),
        Then('both list the placed order')(({ found }, expect) => expect([found.a, found.b]).toEqual([true, true])),
      ),
    )
  })
```

## WRONG

```tsx
// WRONG: a story pushes data into a fixture module
export const Shown = { beforeEach: () => seedOrders([new Order({ id: 'order-9', item: 'Sofa' })]) }
// WRONG: a decorator writes an app atom to set state the I/O layer would answer
const withNoOrders: Decorator = (Story) => {
  useAtomSet(ordersSnapshotAtom)(OrdersSnapshot.Empty())
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
// WRONG: a control used as a data channel, holding the records a screen lists
const orders = makeRecord<ReadonlyArray<Order>>('orders', [])
// WRONG: the world kept in module scope, so one story's writes leak into the next
const world = { orders: Ref.makeUnsafe(SEEDED_ORDERS) }
// WRONG: the contract suite imports the stand-in from __mocks__
import { ServiceLayer } from '../src/io/__mocks__/layer'
```
