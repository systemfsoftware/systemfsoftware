import { it, makeFeature } from '@systemfsoftware/effect-gherkin-spec'
import { Gherkin, Given, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Clock, Context, Effect, Layer } from 'effect'

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
        Then('the label is the shared one')((s, expect) => expect(s.label).toBe('shared')),
      ),
    )

    scenario(
      'The current wall-clock time is a finite number',
      Gherkin.Do.pipe(
        Given('the current time')('now', () => Clock.currentTimeMillis),
        Then('the time is a finite number')((s, expect) =>
          expect(s.now).toSatisfy(Number.isFinite, 'the wall clock reads a finite number')
        ),
      ),
    )

    scenario(
      'A scoped token is available inside the scenario',
      scope.pipe(
        Then('the token is present')((s, expect) => expect(s.token).toBe('scoped')),
      ),
    )
  })
