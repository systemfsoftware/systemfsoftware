import { type EngineSubject, LawSite } from '@systemfsoftware/effect-e2e-conformance'
import {
  Action,
  Engine,
  type EngineShape,
  type Locator,
  type Observation,
  ReadRequest,
  type SemanticNode,
} from '@systemfsoftware/effect-e2e/engine'
import { Effect, Layer, Option, Ref } from 'effect'

import { everyCapability, LAW_ORIGIN, lawSite } from './law-site.js'

const firstOf = (target: Locator): Locator => ({
  expression: { kind: 'Nth', inner: target.expression, index: 'first' },
  label: target.label,
})

const checkedSubscribe = (tree: ReadonlyArray<SemanticNode>): ReadonlyArray<SemanticNode> =>
  tree.map((node) =>
    node.name === 'Subscribe'
      ? Object.assign({}, node, { states: { ...node.states, checked: true } })
      : Object.assign({}, node, { children: checkedSubscribe(node.children) })
  )

const breakages = {
  open: (good: EngineShape): Partial<EngineShape> => ({
    open: (url) => good.open(new URL(LawSite.form, url).href),
  }),
  read: (good: EngineShape): Partial<EngineShape> => ({
    read: (locator, request) =>
      ReadRequest.guards.Value(request) ? Effect.succeed({ _tag: 'Value', value: '' }) : good.read(locator, request),
  }),
  query: (good: EngineShape): Partial<EngineShape> => ({
    query: (locator) => Effect.map(good.query(locator), (nodes) => nodes.slice(0, 1)),
  }),
  act: (good: EngineShape): Partial<EngineShape> => ({
    act: (action) =>
      Effect.catchTag(good.act(action), 'LOCATOR_AMBIGUOUS', (failure) =>
        Action.guards.Tap(action)
          ? good.act({ _tag: 'Tap', target: firstOf(action.target) })
          : Effect.fail(failure)),
  }),
  screenshot: (good: EngineShape): Partial<EngineShape> => ({
    screenshot: (request) => Effect.as(good.screenshot(request), new Uint8Array()),
  }),
  route: (good: EngineShape): Partial<EngineShape> => ({
    route: Effect.map(good.route, (route) => ({ ...route, path: '/' })),
  }),
  logs: (good: EngineShape): Partial<EngineShape> => ({ logs: Effect.as(good.logs, []) }),
  observe: (good: EngineShape): Partial<EngineShape> => ({
    observe: Effect.map(good.observe, (observation): Observation => ({
      ...observation,
      tree: checkedSubscribe(observation.tree),
    })),
  }),
  rebuild: (good: EngineShape, held: Ref.Ref<Option.Option<Observation>>): Partial<EngineShape> => ({
    open: (url) =>
      good.open(url).pipe(
        Effect.andThen(Effect.orDie(good.observe)),
        Effect.flatMap((first) => Ref.set(held, Option.some(first))),
      ),
    observe: Effect.flatMap(
      good.observe,
      (now) => Effect.map(Ref.get(held), Option.getOrElse(() => now)),
    ),
  }),
  close: (): Partial<EngineShape> => ({ close: Effect.void }),
} as const

export type BrokenMethod = keyof typeof breakages

export const brokenSubject = (method: BrokenMethod): EngineSubject => ({
  name: `in-memory with a broken ${method}`,
  origin: LAW_ORIGIN,
  layer: Layer.effect(Engine)(
    Effect.gen(function*() {
      const good = yield* Engine
      const held = yield* Ref.make(Option.none<Observation>())
      return Engine.of({ ...good, ...breakages[method](good, held) })
    }),
  ).pipe(Layer.provide(Engine.layerTest(lawSite(everyCapability)))),
})
