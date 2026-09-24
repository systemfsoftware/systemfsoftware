/**
 * Feature builder surfaces — layer, live declaration, and scope.
 *
 * One Feature drives withLayer + live + withScope together so the
 * layered live path is exercised as a consumer would call it.
 */
import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Clock, Context, Effect, Layer } from 'effect'
import { expect } from 'vitest'

const Feature = makeFeature({ it })

class Widget extends Context.Service<Widget, { readonly label: string }>()(
  '@systemfsoftware/effect-gherkin-spec/tests/feature-builder-surfaces.integration.test/Widget',
) {}

const widgetLayer = Layer.succeed(Widget, { label: 'shared' })

Feature('Feature builder — live clock with a shared layer')
  .withLayer(widgetLayer)
  .withScope({ token: Effect.succeed('scoped') })
  .live('the wall clock behind this suite reads wall time')
  .body(({ scenario, scope }) => {
    scenario(
      'A shared service is available inside the scenario',
      Gherkin.Do.pipe(
        Given('the widget is in the environment')('label', () => Widget.pipe(Effect.map((w) => w.label))),
        Then('the label is the shared one')((s) => {
          expect(s.label).toBe('shared')
        }),
      ),
    )

    scenario(
      'The current wall-clock time is a finite number',
      Gherkin.Do.pipe(
        Given('the current time')('now', () => Clock.currentTimeMillis),
        Then('the time is a finite number')((s) => {
          expect(Number.isFinite(s.now)).toBe(true)
        }),
      ),
    )

    scenario(
      'A scoped token is available inside the scenario',
      scope.pipe(
        Then('the token is present')((s) => {
          expect(s.token).toBe('scoped')
        }),
      ),
    )
  })
