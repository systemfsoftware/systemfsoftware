/**
 * Feature builder surfaces — layer, live clock, and scope.
 *
 * One Feature drives withLayer + liveClock + withScope together so the
 * layered live-clock path (no TestClock.withLive) is exercised as a
 * consumer would call it.
 */
import { it, layer, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Clock, Context, Effect, Layer } from 'effect'
import { expect } from 'vitest'
import { Gherkin, Given, Then } from '../src/mod.js'

const Feature = makeFeature({ it, layer })

class Widget extends Context.Service<Widget, { readonly label: string }>()(
  '@systemfsoftware/effect-gherkin-spec/__tests__/feature-builder-surfaces.integration.test/Widget',
) {}

const widgetLayer = Layer.succeed(Widget, { label: 'shared' })

Feature('Feature builder — live clock with a shared layer')
  .liveClock()
  .withLayer(widgetLayer)
  .withScope({ token: Effect.succeed('scoped') })
  .body(({ scenario, scope }) => {
    scenario(
      'Should read the shared service when withLayer provides it',
      Gherkin.Do.pipe(
        Given('the widget is in the environment')('label', () => Widget.pipe(Effect.map((w) => w.label))),
        Then('the label is the shared one')((s) => {
          expect(s.label).toBe('shared')
        }),
      ),
    )

    scenario(
      'Should observe a finite wall-clock time when liveClock is set',
      Gherkin.Do.pipe(
        Given('the current time')('now', () => Clock.currentTimeMillis),
        Then('the time is a finite number')((s) => {
          expect(Number.isFinite(s.now)).toBe(true)
        }),
      ),
    )

    scenario(
      'Should expose the scope binding when withScope is set',
      scope.pipe(
        Then('the token is present')((s) => {
          expect(s.token).toBe('scoped')
        }),
      ),
    )
  })
