import { RegistryContext, useAtomSuspense } from '@systemfsoftware/effect-atom-react'
import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import * as AsyncResult from '@systemfsoftware/effect-atom/Result'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { render, screen } from '@testing-library/react'
import * as Effect from 'effect/Effect'
import * as React from 'react'
import { Suspense } from 'react'
import { expect, vi } from 'vitest'

const Feature = makeFeature({ it })

Feature('Keeping two widgets on separate data sources independent of each other')
  .live('renders real components in Chromium and advances the browser timer queue')
  .body(({ scenario }) => {
    scenario(
      'A widget still loading keeps waiting while the other widget is put away',
      Gherkin.Do.pipe(
        Given(
          'Ada opens two widgets on their own data sources, each showing a value that never finishes loading',
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
        When('Ada shows both widgets and lets enough time pass for cleanup to run')(
          'shown',
          (s) =>
            Effect.sync(() => {
              function Comp({ id }: { readonly id: string }) {
                const result = useAtomSuspense(s.ctx.atom)
                let value = 0
                if (AsyncResult.isSuccess(result)) {
                  value = result.value
                }
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

              const firstLoading = screen.queryByTestId('first-loading') !== null
              const secondLoading = screen.queryByTestId('second-loading') !== null

              vi.useRealTimers()
              return { firstLoading, secondLoading }
            }),
        ),
        Then('Ada still sees at least one widget waiting, never both flipped to the same state')((s) => {
          expect(s.shown.firstLoading || s.shown.secondLoading).toBe(true)
        }),
      ),
    )
  })
