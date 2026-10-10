import { it } from '@systemfsoftware/vitest'
import { Match, Option, Schema } from 'effect'
import * as Result from 'effect/Result'
import { GuestPort, JobSpec, MicroVMSpec, ServiceSpec, WaitStrategy } from '../MicroVMSpec.schema.js'
import { ResolveWaitStrategy, resolveWaitStrategy, type WaitRequired } from '../resolve-wait-strategy.workflow.js'

type Resolve = typeof resolveWaitStrategy

const requiredOf = (resolve: Resolve, spec: MicroVMSpec, law: (required: WaitRequired) => boolean): boolean =>
  Result.match(resolve(new ResolveWaitStrategy({ spec })), {
    onFailure: () => false,
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('WaitRequired', (required) => law(required)),
        Match.tag('WaitSkipped', () => false),
        Match.exhaustive,
      ),
  })

const skippedOf = (resolve: Resolve, spec: MicroVMSpec): boolean =>
  Result.match(resolve(new ResolveWaitStrategy({ spec })), {
    onFailure: () => false,
    onSuccess: (decision) =>
      Match.value(decision).pipe(
        Match.tag('WaitRequired', () => false),
        Match.tag('WaitSkipped', () => true),
        Match.exhaustive,
      ),
  })

const specWithoutStrategy = (spec: MicroVMSpec, ports: ReadonlyArray<number>): MicroVMSpec =>
  ServiceSpec.make({
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
  return ServiceSpec.make({
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
    requiredOf(
      subject,
      specWithStrategy(spec, strategy),
      (required) => Schema.toEquivalence(WaitStrategy)(required.strategy, strategy),
    ),
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
    requiredOf(subject, specWithoutStrategy(spec, [port]), (required) => Option.contains(portOf(required), port)),
)

it.prop(
  '∀job_Strategy_=Skipped',
  { of: [JobSpec], subject: resolveWaitStrategy },
  (subject, [job]) => skippedOf(subject, job),
)

const specWaitKeyOf = (strategy: WaitStrategy): string =>
  Match.value(strategy).pipe(
    Match.tag('Port', ({ port }) => `port:${port}`),
    Match.tag('Http', ({ path, port }) => `http:${path}@${port}`),
    Match.tag('Log', ({ pattern }) => `log:${pattern}`),
    Match.exhaustive,
  )

const waitKeyOf = (resolve: Resolve, strategy: WaitStrategy): Option.Option<string> =>
  Result.match(
    resolve(
      new ResolveWaitStrategy({
        spec: ServiceSpec.make({ image: 'alpine:3.20', env: {}, mounts: [], ports: [], waitStrategy: strategy }),
      }),
    ),
    {
      onFailure: () => Option.none<string>(),
      onSuccess: (decision) =>
        Match.value(decision).pipe(
          Match.tag('WaitRequired', (required) => Option.some(required.label)),
          Match.tag('WaitSkipped', () => Option.none<string>()),
          Match.exhaustive,
        ),
    },
  )

it.prop(
  '∀strategy_WaitKey_≡Spec',
  { of: [WaitStrategy], subject: resolveWaitStrategy },
  (subject, [strategy]) => Option.contains(waitKeyOf(subject, strategy), specWaitKeyOf(strategy)),
)
