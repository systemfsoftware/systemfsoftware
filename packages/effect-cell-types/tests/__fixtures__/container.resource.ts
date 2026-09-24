import { Resource } from '@systemfsoftware/effect-cell-types'
import type * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'
import { make as running, type RunningContainer } from './running-container.handle.js'

export class ServiceSpec extends Schema.TaggedClass<ServiceSpec>()('Service', {
  image: Schema.String,
  ports: Schema.Array(Schema.Finite),
}) {}

export class JobSpec extends Schema.TaggedClass<JobSpec>()('Job', {
  image: Schema.String,
  ports: Schema.Array(Schema.Finite),
  workdir: Schema.String,
}) {}

export type ContainerSpec = ServiceSpec | JobSpec

export const TypeId = Symbol.for('~systemfsoftware/effect-cell-types/tests/Container')
export type TypeId = typeof TypeId

const scoped = (spec: ContainerSpec): Effect.Effect<RunningContainer> =>
  Effect.succeed(running({ id: spec.image, driver: { exec: (cmd) => Promise.resolve(cmd.length) } }))

const layer = (spec: ContainerSpec) => <Id>(key: Context.Key<Id, RunningContainer>): Layer.Layer<Id> =>
  Layer.effect(key)(scoped(spec))

const Services = Resource.make<ContainerSpec>()({
  typeId: TypeId,
  combinators: {
    withPort: (spec, port: number): ContainerSpec =>
      Match.value(spec).pipe(
        Match.tag('Service', (service) => new ServiceSpec({ image: service.image, ports: [...service.ports, port] })),
        Match.tag('Job', (job) => job),
        Match.exhaustive,
      ),
  },
  projections: { scoped, layer },
})

const Jobs = Resource.make<JobSpec>()({
  typeId: TypeId,
  combinators: {
    withPort: (spec, _port: number): JobSpec => spec,
    withWorkdir: (spec, workdir: string): JobSpec => new JobSpec({ image: spec.image, ports: spec.ports, workdir }),
  },
  projections: {
    scoped,
    layer,
    run: (spec): Effect.Effect<string> => Effect.as(scoped(spec), spec.workdir),
  },
})

export type Container = Resource.Of<typeof Services>
export type Job = Resource.Of<typeof Jobs>

export const isContainer = Services.is

export const make = (image: string): Container => Services.of(new ServiceSpec({ image, ports: [] }))

export const job = (image: string): Job => Jobs.of(new JobSpec({ image, ports: [], workdir: '/' }))

export const withPort = Services.combinators.withPort

export const withWorkdir = Jobs.combinators.withWorkdir
