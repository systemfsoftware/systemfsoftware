import {
  type FeatureFn,
  it,
  layer,
  makeFeature,
  resolveScenarioArgs,
  StepError,
} from '@systemfsoftware/effect-gherkin-spec'
import { Context, Effect, Layer } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

class RuntimeSvc extends Context.Service<RuntimeSvc, string>()(
  '@systemfsoftware/effect-gherkin-spec/tests/feature-runtime.integration.test/RuntimeSvc',
) {}

class FreshSvc extends Context.Service<FreshSvc, number>()(
  '@systemfsoftware/effect-gherkin-spec/tests/feature-runtime.integration.test/FreshSvc',
) {}

type Registration = {
  readonly name: string
  readonly tester: string
  readonly thunk: () => Effect.Effect<unknown, StepError>
}

const makeRecorder = () => {
  const registrations: Registration[] = []
  const tester = (label: string) => {
    const run = (name: string, thunk: () => Effect.Effect<unknown, StepError>): void => {
      registrations.push({ name, tester: label, thunk })
    }
    return Object.assign(run, {
      skip: (name: string, thunk: () => Effect.Effect<unknown, StepError>): void => {
        registrations.push({ name, tester: `${label}.skip`, thunk })
      },
      only: (name: string, thunk: () => Effect.Effect<unknown, StepError>): void => {
        registrations.push({ name, tester: `${label}.only`, thunk })
      },
    })
  }
  const fakeIt = {
    effect: tester('effect'),
    live: tester('live'),
  } as unknown as Parameters<typeof makeFeature>[0]['it']
  const fakeLayer = (_layerDef: unknown, _opts?: unknown) => (wireBody: (scopedIt: unknown) => void): void => {
    wireBody({ effect: tester('scoped.effect') })
  }
  const stubDescribe = (): () => void => {
    const real = (globalThis as Record<string, unknown>)['describe']
    const fake = Object.assign(
      (_name: string, ...rest: readonly unknown[]): void => {
        const fn = [...rest].reverse().find((a): a is () => void => typeof a === 'function')
        fn?.()
      },
      {
        skip: (_name: string, ...rest: readonly unknown[]): void => {
          const fn = [...rest].reverse().find((a): a is () => void => typeof a === 'function')
          fn?.()
        },
        only: (_name: string, ...rest: readonly unknown[]): void => {
          const fn = [...rest].reverse().find((a): a is () => void => typeof a === 'function')
          fn?.()
        },
      },
    )
    ;(globalThis as Record<string, unknown>)['describe'] = fake
    return () => {
      ;(globalThis as Record<string, unknown>)['describe'] = real
    }
  }
  const subject = (): FeatureFn =>
    makeFeature({
      it: fakeIt,
      layer: fakeLayer as unknown as Parameters<typeof makeFeature>[0]['layer'],
    })
  return { registrations, stubDescribe, subject }
}

Feature('Feature runtime — scenario composition and registration').body(({ scenario }) => {
  scenario(
    'A registered scenario pipeline runs to completion',
    Effect.gen(function*() {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      const trace: string[] = []
      try {
        rec.subject()('a suite for pipeline execution').body(({ scenario: inner }) => {
          inner(
            'a scenario body executes its steps in order',
            Effect.sync(() => {
              trace.push('step1')
              trace.push('step2')
            }),
          )
        })
      } finally {
        restore()
      }
      expect(rec.registrations).toHaveLength(1)
      yield* Effect.promise(() => Effect.runPromise(rec.registrations[0]?.thunk() ?? Effect.void))
      expect(trace).toEqual(['step1', 'step2'])
    }),
  )

  scenario(
    'A background step runs before the scenario body',
    Effect.gen(function*() {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      const trace: string[] = []
      try {
        rec.subject()('a suite for background ordering').body(({ background, scenario: inner }) => {
          background(
            Effect.sync(() => {
              trace.push('bg')
            }),
          )
          inner(
            'a scenario observes the background having run first',
            Effect.sync(() => {
              trace.push('scenario')
            }),
          )
        })
      } finally {
        restore()
      }
      expect(rec.registrations).toHaveLength(1)
      yield* Effect.promise(() => Effect.runPromise(rec.registrations[0]?.thunk() ?? Effect.void))
      expect(trace).toEqual(['bg', 'scenario'])
    }),
  )

  scenario(
    'Background output is discarded and the scenario resolves void',
    Effect.gen(function*() {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      try {
        rec.subject()('a suite for background scope').body(({ background, scenario: inner }) => {
          background(Effect.succeed({ bgData: 'should be discarded' }))
          inner('a scenario result carries no background value', Effect.succeed('scenario-result'))
        })
      } finally {
        restore()
      }
      expect(rec.registrations).toHaveLength(1)
      const result = yield* Effect.promise(() => Effect.runPromise(rec.registrations[0]?.thunk() ?? Effect.void))
      expect(result).toBe(void 0)
    }),
  )

  scenario(
    'A scenario layer option provides its service to the pipeline',
    Effect.gen(function*() {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      const seen: string[] = []
      try {
        rec.subject()('a suite for scenario layers').body(({ scenario: inner }) => {
          inner(
            'a scenario with options observes its provided service',
            { layer: Layer.succeed(RuntimeSvc, 'ok') },
            RuntimeSvc.pipe(Effect.map((value) => seen.push(value))),
          )
        })
      } finally {
        restore()
      }
      expect(rec.registrations).toHaveLength(1)
      yield* Effect.promise(() => Effect.runPromise(rec.registrations[0]?.thunk() ?? Effect.void))
      expect(seen).toEqual(['ok'])
    }),
  )

  scenario(
    'A fresh scenario layer builds once per registered scenario',
    Effect.gen(function*() {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      let counter = 0
      try {
        rec
          .subject()('a suite for fresh layers')
          .withScenarioLayer(Layer.effect(FreshSvc, Effect.sync(() => ++counter)))
          .body(({ scenario: inner }) => {
            inner('a first scenario builds the fresh layer', Effect.void)
            inner('a second scenario builds the fresh layer again', Effect.void)
          })
      } finally {
        restore()
      }
      expect(rec.registrations).toHaveLength(2)
      yield* Effect.promise(() => Effect.runPromise(rec.registrations[0]?.thunk() ?? Effect.void))
      yield* Effect.promise(() => Effect.runPromise(rec.registrations[1]?.thunk() ?? Effect.void))
      expect(counter).toBe(2)
    }),
  )

  scenario(
    'Scenario skip and only forward their registration mode',
    Effect.sync(() => {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      try {
        rec.subject()('a suite for scenario modes').body(({ scenario: inner }) => {
          inner('a base scenario registers under run mode', Effect.void)
          inner.skip('a skipped scenario registers under skip mode', Effect.void)
          inner.only('a focused scenario registers under only mode', Effect.void)
        })
      } finally {
        restore()
      }
      expect(rec.registrations.map((r) => r.tester)).toEqual(['effect', 'effect.skip', 'effect.only'])
    }),
  )

  scenario(
    'An outline registers one scenario per example row',
    Effect.sync(() => {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      try {
        rec.subject()('a suite for outline expansion').body(({ scenarioOutline }) => {
          scenarioOutline(
            'An outline example registers a scenario per row',
            [{ x: '1' }, { x: '2' }],
            () => Effect.void,
          )
        })
      } finally {
        restore()
      }
      expect(rec.registrations).toHaveLength(2)
      expect(rec.registrations.every((r) => r.tester === 'effect')).toBe(true)
    }),
  )

  scenario(
    'Outline row factories receive their typed rows',
    Effect.sync(() => {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      type Row = { role: string; id: string }
      const receivedRows: Row[] = []
      try {
        rec.subject()('a suite for outline rows').body(({ scenarioOutline }) => {
          scenarioOutline(
            'An outline passes its typed row to the factory',
            [{ role: 'admin', id: '1' }, { role: 'user', id: '2' }] satisfies readonly Row[],
            (row: Row) => {
              receivedRows.push(row)
              return Effect.void
            },
          )
        })
      } finally {
        restore()
      }
      expect(receivedRows).toEqual([
        { role: 'admin', id: '1' },
        { role: 'user', id: '2' },
      ])
    }),
  )

  scenario(
    'Outline titles render row values into their placeholders',
    Effect.sync(() => {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      try {
        rec.subject()('a suite for outline titles').body(({ scenarioOutline }) => {
          scenarioOutline(
            'A <role> example expands into one scenario',
            [{ role: 'admin' }, { role: 'user' }],
            () => Effect.void,
          )
        })
      } finally {
        restore()
      }
      expect(rec.registrations.map((r) => r.name)).toEqual([
        'A admin example expands into one scenario',
        'A user example expands into one scenario',
      ])
    }),
  )

  scenario(
    'Outline skip and only forward their registration mode',
    Effect.sync(() => {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      try {
        rec.subject()('a suite for outline modes').body(({ scenarioOutline }) => {
          scenarioOutline.skip('A skipped outline registers under skip mode', [{ x: '1' }], () => Effect.void)
          scenarioOutline.only('A focused outline registers under only mode', [{ x: '1' }], () => Effect.void)
        })
      } finally {
        restore()
      }
      expect(rec.registrations.map((r) => r.tester)).toEqual(['effect.skip', 'effect.only'])
    }),
  )

  scenario(
    'Second arguments resolve to pipelines and options',
    Effect.sync(() => {
      const pipelineEffect = Effect.void
      const direct = resolveScenarioArgs(pipelineEffect, void 0)
      expect(direct.pipeline).toBe(pipelineEffect)
      expect(direct.opts).toBeNull()
      const opts = { layer: Layer.empty }
      const withOpts = resolveScenarioArgs(opts, Effect.void)
      expect(withOpts.opts).toBe(opts)
      expect(withOpts.pipeline).toBeDefined()
    }),
  )
})
