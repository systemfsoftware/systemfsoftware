import { Conformance } from '@systemfsoftware/conformance-spec'
import { And, Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Match } from 'effect'

import { windowRelease } from './__fixtures__/observation-window-release.js'

const Feature = makeFeature({ it })

const SERVICE_NAME = 'trace-spec'

const passing = (report: Conformance.Report<never, never>): Conformance.Pass =>
  Match.value(report).pipe(
    Match.tag('Pass', (pass) => pass),
    Match.orElse(() => {
      throw new Error(`expected the check to pass, but it read: ${Conformance.render(report)}`)
    }),
  )

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
        Then('no span the window recorded is still handed back by its exporter after any stop')((s) => {
          passing(s.checked)
        }),
        And('at least one stop was tried')((s) => {
          if (passing(s.checked).histories <= 0) {
            throw new Error('expected the check to have tried at least one stop')
          }
        }),
      ),
    )
  })
