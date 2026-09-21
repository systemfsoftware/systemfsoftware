import { it } from '@effect/vitest'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import * as Arbitrary from 'effect/unstable/arbitrary/Arbitrary'
import { GuestPort, MicroVMSpec, WaitStrategy } from '../MicroVMSpec.schema.js'
import {
  ResolveWaitStrategy,
  resolveWaitStrategy,
  type WaitRequired,
  type WaitStrategyDecision,
} from '../resolve-wait-strategy.workflow.js'

const decisionOf = (spec: MicroVMSpec): WaitStrategyDecision =>
  Result.getOrThrow(resolveWaitStrategy(new ResolveWaitStrategy({ spec })))

const requiredOf = (spec: MicroVMSpec): Option.Option<WaitRequired> =>
  Match.value(decisionOf(spec)).pipe(
    Match.tag('WaitRequired', (required) => Option.some(required)),
    Match.tag('WaitSkipped', () => Option.none<WaitRequired>()),
    Match.exhaustive,
  )

const skippedOf = (spec: MicroVMSpec): boolean =>
  Match.value(decisionOf(spec)).pipe(
    Match.tag('WaitRequired', () => false),
    Match.tag('WaitSkipped', () => true),
    Match.exhaustive,
  )

const specWithoutStrategy = (spec: MicroVMSpec, ports: ReadonlyArray<number>): MicroVMSpec => ({
  image: spec.image,
  env: spec.env,
  ports,
  mounts: spec.mounts,
})

const specWithStrategy = (spec: MicroVMSpec, strategy: WaitStrategy): MicroVMSpec => ({
  image: spec.image,
  env: spec.env,
  ports: spec.ports,
  mounts: spec.mounts,
  waitStrategy: strategy,
})

const portOf = (required: WaitRequired): Option.Option<number> =>
  Match.value(required.strategy).pipe(
    Match.tag('Port', ({ port }) => Option.some(port)),
    Match.tag('Http', () => Option.none<number>()),
    Match.tag('Log', () => Option.none<number>()),
    Match.exhaustive,
  )

const specArb = Arbitrary.schema(MicroVMSpec)
const strategyArb = Arbitrary.schema(WaitStrategy)
const guestPortArb = Arbitrary.schema(GuestPort)

it.prop(
  '∀spec_Explicit_=Echo',
  [specArb, strategyArb],
  ([spec, strategy]) =>
    Option.match(requiredOf(specWithStrategy(spec, strategy)), {
      onNone: () => false,
      onSome: (required) => Schema.toEquivalence(WaitStrategy)(required.strategy, strategy),
    }),
)

it.prop('∀spec_NoPorts_=Skipped', [specArb], ([spec]) => skippedOf(specWithoutStrategy(spec, [])))

it.prop(
  '∀spec_FirstPort_=Probed',
  [specArb, guestPortArb],
  ([spec, port]) =>
    Option.match(requiredOf(specWithoutStrategy(spec, [port])), {
      onNone: () => false,
      onSome: (required) => Option.contains(portOf(required), port),
    }),
)
