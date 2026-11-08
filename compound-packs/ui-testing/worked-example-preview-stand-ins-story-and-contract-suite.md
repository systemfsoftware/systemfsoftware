---
title: Wire Storybook file for file as this worked example does, with the preview, the I/O layer stand-in, the fixture controls, the router stand-in, a story and the stand-in's contract suite
applies_when:
  - setting up Storybook in an app, or adding its first story
  - writing or changing .storybook/preview, a file in a __mocks__ folder, a story, or the I/O layer stand-in's contract suite
  - unsure what a stand-in, a fixture control or the router stand-in looks like in code
tags: [storybook, sb-mock, io, router, stand-in, fixture-controls, contract-test, worked-example]
---

Applies to: every app with Storybook stories. Copy these files and rename `Orders` to the app's own I/O services; keep every path, export name and wiring as shown. This is everything needed: no other source is required to follow this pack. The rules it puts together are stories-get-io-from-stand-ins-beside-the-io-module.md and each-journey-starts-from-reset-fixture-controls.md in this pack, and port-fakes-share-a-contract-suite.md in the testing pack.

The app's production code, which the stories run unchanged:

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
  readonly total: number
}
export class OrdersUnreachable extends Data.TaggedError('OrdersUnreachable') {}

export class OrdersClient extends Context.Service<OrdersClient, {
  readonly list: () => Effect.Effect<ReadonlyArray<Order>, OrdersUnreachable>
}>()('app/io/OrdersClient') {}

export const OrdersClientLive = Layer.effect(
  OrdersClient,
  Effect.gen(function*() {
    const { baseUrl } = yield* OrdersConfig
    return OrdersClient.of({
      list: () =>
        Effect.tryPromise({
          try: (signal) =>
            fetch(`${baseUrl}/orders`, { signal }).then((r) => r.json() as Promise<ReadonlyArray<Order>>),
          catch: () => new OrdersUnreachable(),
        }),
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
}))
```

```tsx
// src/features/orders/OrderList.tsx: the component under test
import { useAtomValue } from '@effect/atom-react'
import { ordersAtom } from './orders.atom'

export function OrderList() {
  const orders = useAtomValue(ordersAtom)
  if (orders._tag === 'Failure') return <p role='alert'>We could not load your orders</p>
  if (orders._tag !== 'Success') return <p>Loading your orders</p>
  return (
    <ul aria-label='Your orders'>
      {orders.value.map((order) => <li key={order.id}>Order {order.id}</li>)}
    </ul>
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

2. `src/io/__mocks__/fixture-controls.ts`: the only module that holds stand-in state. Every control registers its reset when it is created, and `resetAll()` runs every registered reset. The registry and the control kinds may come from a small shared helper package; the shape stays this.

```typescript
import type { Order } from '@/io/orders.client'

const controls = new Map<string, () => void>()

const defineControl = (name: string, reset: () => void): void => {
  if (controls.has(name)) throw new Error(`fixture-controls: a control named "${name}" is already registered`)
  controls.set(name, reset)
}

export const resetAll = (): void => {
  for (const reset of controls.values()) reset()
}

const makeRecord = <A>(name: string, initial: A) => {
  let value = initial
  defineControl(name, () => {
    value = initial
  })
  return {
    get: (): A => value,
    set: (next: A): void => {
      value = next
    },
  }
}

const makeFault = (name: string) => {
  let armed = false
  defineControl(name, () => {
    armed = false
  })
  return {
    arm: (): void => {
      armed = true
    },
    consult: (): boolean => armed,
  }
}

const ordersAnswer = makeRecord<ReadonlyArray<Order>>('ordersAnswer', [])
const ordersFault = makeFault('ordersUnreachable')

export const answerOrders = (orders: ReadonlyArray<Order>): void => ordersAnswer.set(orders)
export const currentOrders = (): ReadonlyArray<Order> => ordersAnswer.get()
export const makeOrdersUnreachable = (): void => ordersFault.arm()
export const ordersUnreachable = (): boolean => ordersFault.consult()
```

3. `src/io/__mocks__/layer.ts`: the I/O layer stand-in. It exports every name `src/io/layer.ts` exports, with the same type (it may export more, here `OrdersClientStandIn` for its contract suite), builds each service through its real `Context.Service`, and answers from the fixture controls when called.

```typescript
import { currentOrders, ordersUnreachable } from '@/io/__mocks__/fixture-controls'
import type { ServiceLayer as IOLayer } from '@/io/layer'
import { OrdersClient, OrdersUnreachable } from '@/io/orders.client'
import { Effect, Layer } from 'effect'

export const OrdersClientStandIn = Layer.succeed(
  OrdersClient,
  OrdersClient.of({
    list: () =>
      Effect.suspend(() =>
        ordersUnreachable() ? Effect.fail(new OrdersUnreachable()) : Effect.succeed(currentOrders())
      ),
  }),
)

export const ServiceLayer: IOLayer = Layer.mergeAll(OrdersClientStandIn)
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

5. `src/features/orders/OrderList.stories.tsx`: a story that renders the component, sets its data through fixture controls before mount, and asserts in a play function what a person sees. `OrderList`, `ordersAtom`, `appRuntime` and `OrdersClient` all run their real code.

```tsx
import { answerOrders, makeOrdersUnreachable, resetAll } from '@/io/__mocks__/fixture-controls'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { OrderList } from './OrderList'

const meta = {
  component: OrderList,
  beforeEach: () => {
    resetAll()
    return resetAll
  },
} satisfies Meta<typeof OrderList>

export default meta
type Story = StoryObj<typeof meta>

export const ListsEveryOrderThePersonHas: Story = {
  beforeEach: () => {
    answerOrders([{ id: 'A-1', total: 1_250 }, { id: 'A-2', total: 80 }])
  },
  play: async ({ canvas }) => {
    const list = await canvas.findByRole('list', { name: 'Your orders' })
    await expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Order A-1',
      'Order A-2',
    ])
  },
}

export const SaysSoWhenOrdersCannotBeReached: Story = {
  beforeEach: () => {
    makeOrdersUnreachable()
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent('We could not load your orders')
  },
}
```

6. `tests/io-layer.contract.test.ts`: the contract suite. It is required because every service the I/O layer stand-in provides is a port fake, and it is the one test that imports from a `__mocks__` folder, by the app's source alias. Each scenario runs one operation on the stand-in and on the real adapter, and expects the requirement's value from both. The real side talks to the app's real orders backend, which `tests/__fixtures__/orders-backend.ts` starts in a container and whose URL it provides (integration-testing pack). The router stand-in is the real router, so it needs no suite.

```typescript
import { OrdersConfig } from '@/config'
import { makeOrdersUnreachable, resetAll } from '@/io/__mocks__/fixture-controls'
import { OrdersClientStandIn } from '@/io/__mocks__/layer'
import { OrdersClient, OrdersClientLive, OrdersUnreachable } from '@/io/orders.client'
import { Gherkin, Given, it, makeFeature, pairwiseFor, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer, Result } from 'effect'
import { OrdersBackend } from './__fixtures__/orders-backend'

const Feature = makeFeature({ it })

const realAt = (baseUrl: string) =>
  OrdersClientLive.pipe(Layer.provide(Layer.succeed(OrdersConfig, OrdersConfig.of({ baseUrl }))))

const Reachable = pairwiseFor({
  a: { name: 'stand-in', layer: OrdersClientStandIn },
  b: { name: 'real', layer: Layer.unwrap(Effect.map(OrdersBackend.url, realAt)) },
}, OrdersClient)

const Unreachable = pairwiseFor({
  a: { name: 'stand-in', layer: OrdersClientStandIn },
  b: { name: 'real', layer: realAt('http://127.0.0.1:9') }, // nothing listens there
}, OrdersClient)

Feature('Listing orders')
  .withLayer(OrdersBackend.layer)
  .body(({ scenario }) => {
    scenario(
      'A person with no orders gets an empty list',
      Gherkin.Do.pipe(
        Given('no order has been placed')(() => Effect.sync(resetAll)),
        Reachable('the orders are listed')('listed', () => (orders) => Effect.result(orders.list())),
        Then('both answer an empty list')(({ listed }, expect) =>
          expect([listed.a, listed.b]).toEqual([Result.succeed([]), Result.succeed([])])
        ),
      ),
    )
    scenario(
      'Orders that cannot be reached are reported as unreachable',
      Gherkin.Do.pipe(
        Given('the orders cannot be reached')(() =>
          Effect.sync(() => {
            resetAll()
            makeOrdersUnreachable()
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
