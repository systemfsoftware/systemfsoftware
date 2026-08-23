import { RegistryContext, useAtomSuspense } from '@systemfsoftware/effect-atom-react'
import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import * as AsyncResult from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { render, screen } from '@testing-library/react'
import * as Effect from 'effect/Effect'
import * as React from 'react'
import { Suspense } from 'react'
import { expect, vi } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Keeping two on-screen widgets showing values from separate data sources independent of each other')
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
              const first = AtomRegistry.make({ defaultIdleTTL: 5 })
              const second = AtomRegistry.make({ defaultIdleTTL: 5 })
              return { atom, first, second }
            }),
        ),
        When('both widgets are shown, and time passes long enough for cleanup to run')(
          'state',
          (s) =>
            Effect.sync(() => {
              function Comp({ id }: { readonly id: string }) {
                const result = useAtomSuspense(s.ctx.atom)
                const value = AsyncResult.isSuccess(result) ? result.value : 0
                return React.createElement('div', { 'data-testid': `${id}-value` }, value)
              }

              render(
                React.createElement(
                  RegistryContext.Provider,
                  { value: s.ctx.first },
                  React.createElement(
                    Suspense,
                    { fallback: React.createElement('div', { 'data-testid': 'first-loading' }, 'L1') },
                    React.createElement(Comp, { id: 'first' }),
                  ),
                ),
              )
              render(
                React.createElement(
                  RegistryContext.Provider,
                  { value: s.ctx.second },
                  React.createElement(
                    Suspense,
                    { fallback: React.createElement('div', { 'data-testid': 'second-loading' }, 'L2') },
                    React.createElement(Comp, { id: 'second' }),
                  ),
                ),
              )

              vi.advanceTimersByTime(100)

              const firstLoading = !!screen.queryByTestId('first-loading')
              const secondLoading = !!screen.queryByTestId('second-loading')

              vi.useRealTimers()
              return { firstLoading, secondLoading }
            }),
        ),
        Then('the widgets do not both flip to the same state together')((s) => {
          expect(s.state.firstLoading || s.state.secondLoading).toBe(true)
        }),
      ),
    )
  })
