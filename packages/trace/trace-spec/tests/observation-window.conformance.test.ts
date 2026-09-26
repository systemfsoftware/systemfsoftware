import { Conformance } from '@systemfsoftware/conformance-spec'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { ObservationWindow } from '@systemfsoftware/trace-spec'
import { Effect } from 'effect'

import { windowStopSpec } from './__fixtures__/observation-window-stop.js'

const Feature = makeFeature({ it })

Feature('Letting go of an observation window when the work that opened it stops', { timeout: 0 })
  .live('each scenario drives the simulation kernel itself, and a conformance check cannot run inside a kernel run')
  .body(({ scenario }) => {
    scenario(
      'A window stopped at each step of its opening hands every finished span to its exporter and holds none back',
      Gherkin.Do.pipe(
        Given('an observation window of a service that records every span it produces')(
          'spec',
          () => Effect.succeed(windowStopSpec()),
        ),
        When('a window is opened, records one span, and is stopped at each step of opening, one stop per run')(
          'checked',
          (s) => Conformance.stopped({ ...s.spec, unit: ObservationWindow.make }),
        ),
        Then('the window passes every stop cut, holding no finished span back from its exporter')((s, expect) =>
          expect({ report: s.checked, rendered: Conformance.render(s.checked) }).toMatchObject({
            report: { _tag: 'Pass' },
          })
        ),
      ),
    )
  })
