import { RegistryContext, RegistryProvider, useAtomValue } from '@systemfsoftware/effect-atom-react'
import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { act, render } from '@testing-library/react'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as React from 'react'
import { expect } from 'vitest'

const Feature = makeFeature({ it })

Feature('Keeping a shared page data source alive across page updates')
  .live('renders a real page in Chromium and waits on browser timers')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A page update keeps serving the same page data source',
      Gherkin.Do.pipe(
        Given('Ada opens a page that can update itself')('ctx', () =>
          Effect.sync(() => {
            const count = Atom.make(0)
            const seenPages: AtomRegistry.Registry[] = []
            let update: () => void = () => {
              throw new Error('update called before the page rendered')
            }
            function Page() {
              seenPages.push(React.useContext(RegistryContext))
              const [n, setN] = React.useState(0)
              update = () => setN((x) => x + 1)
              const value = useAtomValue(count)
              return React.createElement('div', { 'data-testid': 'stable-count' }, n, ':', value)
            }
            render(
              React.createElement(
                React.StrictMode,
                null,
                React.createElement(RegistryProvider, null, React.createElement(Page)),
              ),
            )
            return { update: () => update, seenPages }
          })),
        When('Ada updates the page')('updated', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.update()()
            })
          })),
        Then('every update saw the same page data source')((s) => {
          expect(new Set(s.ctx.seenPages).size).toBe(1)
        }),
      ),
    )
  })
