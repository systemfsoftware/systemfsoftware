import * as OtelTracer from '@effect/opentelemetry/OtelTracer'
import { Contract, Observation, ObservationWindow, Rel, Stimulus, Suite } from '@systemfsoftware/trace-spec'
import { Span, Taxonomy } from '@systemfsoftware/trace-taxonomy'
import { it } from '@systemfsoftware/vitest'
import { expect } from '@systemfsoftware/vitest'
import { Clock, Duration, Effect, FileSystem, Layer, Schema } from 'effect'
import { TestClock } from 'effect/testing'

const TraceSuite = Suite.make({ it })

const written: Map<string, string> = new Map()

const recordingFileSystem = (written: Map<string, string>) =>
  Layer.succeed(
    FileSystem.FileSystem,
    FileSystem.makeNoop({
      makeDirectory: () => Effect.void,
      writeFileString: (path, data) =>
        Effect.sync(() => {
          written.set(path, data)
        }),
    }),
  )

const harness: Layer.Layer<Observation.Observation | OtelTracer.OtelTracer> = Layer.mergeAll(
  ObservationWindow.make('trace-spec').layer,
)

const Probe = Span.declare({
  id: 'runner.probe',
  name: 'runner.probe',
  attrs: Schema.Struct({ 'runner.trace': Schema.String }),
})

const ProbeTaxonomy = Taxonomy.make('kernel-runner').pipe(Taxonomy.add(Probe))

const idProbe = (dumpName: string) =>
  Stimulus.make({
    name: 'runner.probe',
    run: ({ traceId }: { readonly input: undefined; readonly traceId: string }) =>
      Effect.flatMap(FileSystem.FileSystem, (fs) =>
        Effect.flatMap(
          fs.writeFileString(`${dumpName}/${traceId}.id`, traceId),
          () => Span.start(Probe, { 'runner.trace': traceId })(Effect.void),
        )),
  })

const idContract = (dumpName: string) =>
  Contract.of(ProbeTaxonomy).stimulate(idProbe(dumpName)).holds(Rel.exists(Probe))

const ClockProbe = Span.declare({
  id: 'clock.probe',
  name: 'clock.probe',
  attrs: Schema.Struct({ 'clock.now': Schema.Finite }),
})

const ClockTaxonomy = Taxonomy.make('kernel-clock').pipe(Taxonomy.add(ClockProbe))

const advanceClock = Stimulus.make({
  name: 'clock.probe',
  run: ({ input }: { readonly input: number }) =>
    Effect.gen(function*() {
      yield* TestClock.adjust(Duration.millis(input))
      const now = yield* Clock.currentTimeMillis
      return yield* Span.start(ClockProbe, { 'clock.now': now })(Effect.void)
    }),
})

const clockAt = (millis: number) =>
  Contract.of(ClockTaxonomy).stimulate(advanceClock).holds(Rel.attrs(ClockProbe, { 'clock.now': millis }))

TraceSuite('kernel case runner')
  .withScenarioLayer(Layer.merge(harness, recordingFileSystem(written)))
  .body(({ Case }) => {
    Case('a case runs on the kernel test clock and adjusts it', clockAt(1000), 1000)
    Case('two cases seeding their own trace ids never share one', idContract('cases/pair'), undefined)
  })

it.effect('Should_Hold_When_TwoCasesSeedDistinctTraceIds', () =>
  Effect.gen(function*() {
    const first = yield* idContract('cases/first').pipe(
      Contract.check<undefined>(undefined),
      Effect.provide(Layer.merge(harness, recordingFileSystem(written))),
    )
    const second = yield* idContract('cases/second').pipe(
      Contract.check<undefined>(undefined),
      Effect.provide(Layer.merge(harness, recordingFileSystem(written))),
    )
    expect(first.run.traceId).not.toBe(second.run.traceId)
  }))

TraceSuite('live declaration at the declared stage')
  .live('the kernel declaration forbids what this case drives')
  .withScenarioLayer(Layer.merge(harness, recordingFileSystem(new Map())))
  .body(({ Case }) => {
    Case('a live case holds when the reason precedes the scenario layer', idContract('runner'), undefined)
  })

TraceSuite('live declaration at the shared stage')
  .withLayer(Layer.merge(harness, recordingFileSystem(new Map())))
  .live('the kernel declaration forbids what this case drives')
  .body(({ Case }) => {
    Case('a live case holds when the reason follows the shared layer', idContract('runner'), undefined)
  })

TraceSuite('live declaration at the opened stage')
  .withScenarioLayer(Layer.merge(harness, recordingFileSystem(new Map())))
  .live('the kernel declaration forbids what this case drives')
  .body(({ Case }) => {
    Case('a live case holds when the reason follows the scenario layer', idContract('runner'), undefined)
  })
