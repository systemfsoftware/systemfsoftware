import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Schema } from 'effect'

import { windowRelease } from './__fixtures__/observation-window-release.js'

const Feature = makeFeature({ it })

const SERVICE_NAME = 'trace-spec'

Feature('Letting go of an observation window when the work that opened it stops')
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A window stopped at each step of its opening leaves no span behind in its exporter',
      Gherkin.Do.pipe(
        Given('an observation window of a service that records every span it produces')(
          'window',
          () => windowRelease(SERVICE_NAME),
        ),
        When('a window is opened, records one span, and is stopped at each step of opening, one stop per run')(
          'checked',
          (s) => Conformance.released(s.window.program, { probe: s.window.probe }),
        ),
        Then(
          'no span the window recorded is still handed back by its exporter after any stop, and at least one stop was tried',
        )(
          (s, expect) =>
            expect(s.checked, Conformance.render(s.checked)).toMatchObject({
              _tag: 'Pass',
              histories: expect.schemaMatching(Schema.Int.pipe(Schema.check(Schema.isGreaterThan(0)))),
            }),
        ),
      ),
    )
  })
