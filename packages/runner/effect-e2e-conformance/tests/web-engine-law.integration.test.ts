import { web } from '@systemfsoftware/effect-e2e'
import { LawVerdict, prove } from '@systemfsoftware/effect-e2e-conformance'
import { layer } from '@systemfsoftware/effect-e2e-web'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'

import { servedLawSite } from './__fixtures__/law-site-server.js'

const Feature = makeFeature({ it })

const outcomes = (verdicts: ReadonlyArray<LawVerdict>): ReadonlyArray<string> =>
  verdicts.map((verdict) =>
    LawVerdict.match(verdict, {
      LawHeld: ({ law }) => `${law}: held`,
      LawSkipped: ({ law }) => `${law}: skipped`,
      LawBroken: ({ law, expected, observed }) => `${law}: broken (expected ${expected}, observed ${observed})`,
    })
  )

Feature('Proving the web engine against the engine laws')
  .withLayer(Layer.empty)
  .live('Chromium drives the law site served as static HTML on a loopback socket')
  .body(({ scenario }) => {
    scenario(
      'The web engine over Chromium keeps every law, and the drag law steps aside because dragging is declared',
      Gherkin.Do.pipe(
        When('the engine laws are proven against the web engine over the served law site')(
          'verdicts',
          () =>
            Effect.scoped(
              Effect.flatMap(servedLawSite, (origin) =>
                prove({
                  name: 'web (chromium)',
                  origin,
                  layer: Layer.orDie(layer({ spec: web({ browser: 'chromium' }), contextHeaders: {} })),
                })),
            ),
        ),
        Then('every law holds except the drag law, which is skipped')((s, expect) =>
          expect(outcomes(s.verdicts)).toEqual([
            'route-after-open: held',
            'observe-tree: held',
            'query-role-name: held',
            'fill-then-read: held',
            'tap-checkbox: held',
            'tree-rebuilds-after-acts: held',
            'tap-link-navigates: held',
            'screenshot-masks-without-requiring-a-match: held',
            'drag-capability: skipped',
            'logs-hold-load-evidence-once-open-returns: held',
            'ambiguous-locator: held',
            'missing-locator: held',
            'close-ends-session-and-open-starts-fresh: held',
          ])
        ),
      ),
    )
  })
