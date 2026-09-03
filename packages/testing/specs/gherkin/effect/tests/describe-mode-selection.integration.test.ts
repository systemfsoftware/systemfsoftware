/**
 * Describe-mode selection — suite and scenario registration routing.
 *
 * Drives `makeFeature` with recording doubles for the runner bindings and the
 * global `describe` family to prove that suite starters (`Feature`,
 * `Feature.skip`, `Feature.only`) reach the matching `describe` function and
 * that scenario modes (run/skip/only, plus `liveClock`) reach the matching
 * `it` tester — the routing the module-private selectors own.
 */
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

type TesterCall = { readonly tester: string; readonly name: string }
type SuiteCall = { readonly suite: string; readonly name: string }

const makeRecorder = () => {
  const testers: TesterCall[] = []
  const suites: SuiteCall[] = []
  const tester = (label: string) => {
    const run = (name: string, _thunk: () => unknown): void => {
      testers.push({ tester: label, name })
    }
    return Object.assign(run, {
      skip: (name: string, _thunk: () => unknown): void => {
        testers.push({ tester: `${label}.skip`, name })
      },
      only: (name: string, _thunk: () => unknown): void => {
        testers.push({ tester: `${label}.only`, name })
      },
    })
  }
  const fakeIt = {
    effect: tester('effect'),
    live: tester('live'),
  } as unknown as Parameters<typeof makeFeature>[0]['it']
  const fakeScopedIt = {
    effect: tester('scoped.effect'),
  } as unknown as Parameters<typeof makeFeature>[0]['it']
  const fakeLayer = (_layerDef: unknown, _opts?: unknown) => (wireBody: (scopedIt: unknown) => void): void => {
    wireBody(fakeScopedIt)
  }
  const stubDescribe = (): () => void => {
    const real = (globalThis as Record<string, unknown>)['describe']
    const invoke = (suite: string, args: readonly unknown[]): void => {
      suites.push({ suite, name: args[0] as string })
      const fn = [...args].reverse().find((a): a is () => void => typeof a === 'function')
      fn?.()
    }
    const fake = Object.assign(
      (...args: readonly unknown[]): void => {
        invoke('describe', args)
      },
      {
        skip: (...args: readonly unknown[]): void => {
          invoke('describe.skip', args)
        },
        only: (...args: readonly unknown[]): void => {
          invoke('describe.only', args)
        },
      },
    )
    ;(globalThis as Record<string, unknown>)['describe'] = fake
    return () => {
      ;(globalThis as Record<string, unknown>)['describe'] = real
    }
  }
  return { testers, suites, fakeIt, fakeLayer, stubDescribe }
}

Feature('Describe-mode selection — registration routing').body(({ scenario }) => {
  scenario(
    'Suite starters reach their matching describe function',
    Effect.sync(() => {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      try {
        const Subject = makeFeature({
          it: rec.fakeIt,
          layer: rec.fakeLayer as unknown as Parameters<typeof makeFeature>[0]['layer'],
        })
        Subject('a base suite registers under describe').body(() => {})
        Subject.skip('a skipped suite registers under skip mode').body(() => {})
        Subject.only('a focused suite registers under only mode').body(() => {})
      } finally {
        restore()
      }
      expect(rec.suites).toEqual([
        { suite: 'describe', name: 'a base suite registers under describe' },
        { suite: 'describe.skip', name: 'a skipped suite registers under skip mode' },
        { suite: 'describe.only', name: 'a focused suite registers under only mode' },
      ])
    }),
  )

  scenario(
    'Scenarios register on the tester matching their mode',
    Effect.sync(() => {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      try {
        const Subject = makeFeature({
          it: rec.fakeIt,
          layer: rec.fakeLayer as unknown as Parameters<typeof makeFeature>[0]['layer'],
        })
        Subject('a suite for scenario modes').body(({ scenario: inner }) => {
          inner('a base scenario registers under run mode', Effect.void)
          inner.skip('a skipped scenario registers under skip mode', Effect.void)
          inner.only('a focused scenario registers under only mode', Effect.void)
        })
      } finally {
        restore()
      }
      expect(rec.testers).toEqual([
        { tester: 'effect', name: 'a base scenario registers under run mode' },
        { tester: 'effect.skip', name: 'a skipped scenario registers under skip mode' },
        { tester: 'effect.only', name: 'a focused scenario registers under only mode' },
      ])
    }),
  )

  scenario(
    'Live-clock scenarios register on the live tester family',
    Effect.sync(() => {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      try {
        const Subject = makeFeature({
          it: rec.fakeIt,
          layer: rec.fakeLayer as unknown as Parameters<typeof makeFeature>[0]['layer'],
        })
        Subject('a live suite registers under describe')
          .liveClock()
          .body(({ scenario: inner }) => {
            inner('a live scenario registers on the live tester', Effect.void)
            inner.skip('a skipped live scenario registers on live skip', Effect.void)
          })
      } finally {
        restore()
      }
      expect(rec.testers).toEqual([
        { tester: 'live', name: 'a live scenario registers on the live tester' },
        { tester: 'live.skip', name: 'a skipped live scenario registers on live skip' },
      ])
    }),
  )

  scenario(
    'Layered scenarios register on the scoped effect tester',
    Effect.sync(() => {
      const rec = makeRecorder()
      const restore = rec.stubDescribe()
      try {
        const Subject = makeFeature({
          it: rec.fakeIt,
          layer: rec.fakeLayer as unknown as Parameters<typeof makeFeature>[0]['layer'],
        })
        Subject('a layered suite registers under describe')
          .withLayer(Layer.empty)
          .body(({ scenario: inner }) => {
            inner('a layered scenario registers on scoped effect', Effect.void)
            inner.skip('a skipped layered scenario registers on scoped skip', Effect.void)
            inner.only('a focused layered scenario registers on scoped only', Effect.void)
          })
      } finally {
        restore()
      }
      expect(rec.testers).toEqual([
        { tester: 'scoped.effect', name: 'a layered scenario registers on scoped effect' },
        { tester: 'scoped.effect.skip', name: 'a skipped layered scenario registers on scoped skip' },
        { tester: 'scoped.effect.only', name: 'a focused layered scenario registers on scoped only' },
      ])
    }),
  )
})
