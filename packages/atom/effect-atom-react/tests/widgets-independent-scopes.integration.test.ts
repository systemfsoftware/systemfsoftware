import { Atom } from '@systemfsoftware/effect-atom'
import { AtomReact } from '@systemfsoftware/effect-atom-react'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { vi } from '@systemfsoftware/vitest'
import { render, screen } from '@testing-library/react'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { createElement, Suspense } from 'react'
import { renderCleanupLayer } from './__fixtures__/render-cleanup.js'

const Feature = makeFeature({ it })

Feature('Keeping two on-screen widgets showing values from separate data sources independent of each other')
  .live('renders real components in Chromium and advances the browser timer queue')
  .withLayer(Layer.empty)
  .withScenarioLayer(renderCleanupLayer)
  .body(({ scenario }) => {
    scenario(
      "A widget still loading is not affected when a different widget's cleanup timer runs",
      Gherkin.Do.pipe(
        Given(
          'two independent widgets, each backed by a value that never finishes loading, with a short cleanup timer',
        )(
          'ctx',
          () =>
            Effect.sync(() => {
              vi.useFakeTimers()
              const atom = Atom.make<number, never>(Effect.never)
              const first = Atom.Registry.make({ defaultIdleTTL: 5 })
              const second = Atom.Registry.make({ defaultIdleTTL: 5 })
              return { atom, first, second }
            }),
        ),
        When('both widgets are shown, and time passes long enough for cleanup to run')(
          'state',
          (s) =>
            Effect.sync(() => {
              function Comp({ id }: { readonly id: string }) {
                const result = AtomReact.useAtomSuspense(s.ctx.atom)
                let value = 0
                if (Atom.AsyncResult.isSuccess(result)) {
                  value = result.value
                }
                return createElement('div', { 'data-testid': `${id}-value` }, value)
              }

              render(
                createElement(
                  AtomReact.RegistryContext.Provider,
                  { value: s.ctx.first },
                  createElement(
                    Suspense,
                    { fallback: createElement('div', { 'data-testid': 'first-loading' }, 'L1') },
                    createElement(Comp, { id: 'first' }),
                  ),
                ),
              )
              render(
                createElement(
                  AtomReact.RegistryContext.Provider,
                  { value: s.ctx.second },
                  createElement(
                    Suspense,
                    { fallback: createElement('div', { 'data-testid': 'second-loading' }, 'L2') },
                    createElement(Comp, { id: 'second' }),
                  ),
                ),
              )

              vi.advanceTimersByTime(100)

              const first = screen.queryByTestId('first-value')?.textContent ?? null
              const second = screen.queryByTestId('second-value')?.textContent ?? null

              vi.useRealTimers()
              return { first, second }
            }),
        ),
        Then('the widgets do not both flip to the same state together')((s, expect) =>
          expect(s.state).toSatisfy(
            (state) => state.first === null || state.second === null,
            'at least one widget is still waiting for its value, so one cleanup did not settle both',
          )
        ),
      ),
    )
  })
