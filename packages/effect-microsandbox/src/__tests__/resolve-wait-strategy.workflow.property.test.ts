import { it } from '@effect/vitest'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { GuestPort, JobSpec, MicroVMSpec, ServiceSpec, WaitStrategy } from '../MicroVMSpec.schema.js'
import {
  ResolveWaitStrategy,
  resolveWaitStrategy,
  type WaitRequired,
  type WaitStrategyDecision,
} from '../resolve-wait-strategy.workflow.js'

type Resolve = typeof resolveWaitStrategy

const decisionOf = (resolve: Resolve, spec: MicroVMSpec): WaitStrategyDecision =>
  Result.getOrThrow(resolve(new ResolveWaitStrategy({ spec })))

const requiredOf = (resolve: Resolve, spec: MicroVMSpec): Option.Option<WaitRequired> =>
  Match.value(decisionOf(resolve, spec)).pipe(
    Match.tag('WaitRequired', (required) => Option.some(required)),
    Match.tag('WaitSkipped', () => Option.none<WaitRequired>()),
    Match.exhaustive,
  )

const skippedOf = (resolve: Resolve, spec: MicroVMSpec): boolean =>
  Match.value(decisionOf(resolve, spec)).pipe(
    Match.tag('WaitRequired', () => false),
    Match.tag('WaitSkipped', () => true),
    Match.exhaustive,
  )

const specWithoutStrategy = (spec: MicroVMSpec, ports: ReadonlyArray<number>): MicroVMSpec =>
  new ServiceSpec({
    image: spec.image,
    env: spec.env,
    ports,
    mounts: spec.mounts,
  })

const specWithStrategy = (spec: MicroVMSpec, strategy: WaitStrategy): MicroVMSpec => {
  const ports = Match.value(spec).pipe(
    Match.tag('Service', (s) => s.ports),
    Match.tag('Job', () => []),
    Match.exhaustive,
  )
  return new ServiceSpec({
    image: spec.image,
    env: spec.env,
    ports,
    mounts: spec.mounts,
    waitStrategy: strategy,
  })
}

const portOf = (required: WaitRequired): Option.Option<number> =>
  Match.value(required.strategy).pipe(
    Match.tag('Port', ({ port }) => Option.some(port)),
    Match.tag('Http', () => Option.none<number>()),
    Match.tag('Log', () => Option.none<number>()),
    Match.exhaustive,
  )

it.prop(
  '∀spec_Explicit_=Echo',
  { of: [MicroVMSpec, WaitStrategy], subject: resolveWaitStrategy },
  (subject, [spec, strategy]) =>
    Option.match(requiredOf(subject, specWithStrategy(spec, strategy)), {
      onNone: () => false,
      onSome: (required) => Schema.toEquivalence(WaitStrategy)(required.strategy, strategy),
    }),
)

it.prop(
  '∀spec_NoPorts_=Skipped',
  { of: [MicroVMSpec], subject: resolveWaitStrategy },
  (subject, [spec]) => skippedOf(subject, specWithoutStrategy(spec, [])),
)

it.prop(
  '∀spec_FirstPort_=Probed',
  { of: [MicroVMSpec, GuestPort], subject: resolveWaitStrategy },
  (subject, [spec, port]) =>
    Option.match(requiredOf(subject, specWithoutStrategy(spec, [port])), {
      onNone: () => false,
      onSome: (required) => Option.contains(portOf(required), port),
    }),
)

it.prop(
  '∀job_Strategy_=Skipped',
  { of: [JobSpec], subject: resolveWaitStrategy },
  (subject, [job]) => skippedOf(subject, job),
)
