import { RegistryContext, RegistryProvider, useAtomValue } from '@systemfsoftware/effect-atom-react'
import * as Atom from '@systemfsoftware/effect-atom/Atom'
import * as AtomRegistry from '@systemfsoftware/effect-atom/Registry'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { act, render } from '@testing-library/react'
import * as Effect from 'effect/Effect'
import * as React from 'react'
import { expect } from 'vitest'

const Feature = makeFeature({ it, layer })

Feature('Keeping a shared registry alive')
  .body(({ scenario }) => {
    scenario(
      'A provider that re-renders keeps serving the same registry',
      Gherkin.Do.pipe(
        Given('a page under a strict provider that can be re-rendered')('ctx', () =>
          Effect.sync(() => {
            const count = Atom.make(0)
            const seenRegistries: AtomRegistry.Registry[] = []
            let tick: () => void = () => {
              throw new Error('tick called before the page rendered')
            }
            function Page() {
              seenRegistries.push(React.useContext(RegistryContext))
              const [n, setN] = React.useState(0)
              tick = () => setN((x) => x + 1)
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
            return { tick: () => tick, seenRegistries }
          })),
        When('the page is re-rendered')('done', (s) =>
          Effect.sync(() => {
            act(() => {
              s.ctx.tick()
            })
          })),
        Then('every render saw the same registry')((s) => {
          expect(new Set(s.ctx.seenRegistries).size).toBe(1)
        }),
      ),
    )
  })
