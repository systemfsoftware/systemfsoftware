import { LawVerdict, prove } from '@systemfsoftware/effect-e2e-conformance'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'

import { servedLawSite } from '../__fixtures__/law-site-server.js'
import { type DomMutation, portFake, realMutation } from './__fixtures__/port-fake.js'

const Feature = makeFeature({ it })

const outcomes = (verdicts: ReadonlyArray<LawVerdict>): ReadonlyArray<string> =>
  verdicts.map((verdict) =>
    LawVerdict.match(verdict, {
      LawHeld: ({ law }) => `${law}: held`,
      LawSkipped: ({ law }) => `${law}: skipped`,
      LawBroken: ({ law, expected, observed }) => `${law}: broken (expected ${expected}, observed ${observed})`,
    })
  )

const brokenLaws = (verdicts: ReadonlyArray<LawVerdict>): ReadonlyArray<string> =>
  verdicts.filter(LawVerdict.guards.LawBroken).map(({ law }) => law)

const provenOverServedSite = (mutation: DomMutation) =>
  Effect.scoped(
    Effect.flatMap(servedLawSite, (origin) => prove({ name: 'jsdom port fake', origin, layer: portFake(mutation) })),
  )

const SABOTAGE = {
  'a fill that leaves the field untouched': { ...realMutation, fill: () => undefined },
  'a click that dispatches nothing': { ...realMutation, click: () => undefined },
  'a click that only ever checks': {
    ...realMutation,
    click: (element: HTMLElement) => element.setAttribute('checked', ''),
  },
} satisfies Record<string, DomMutation>

Feature('Proving the jsdom port fake against the engine laws')
  .withLayer(Layer.empty)
  .live('jsdom fetches the law site served as static HTML on a loopback socket')
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'The port fake keeps every law, refusing screenshots and drags because it declares neither',
      Gherkin.Do.pipe(
        When('the engine laws are proven against the port fake over the served law site')(
          'verdicts',
          () => provenOverServedSite(realMutation),
        ),
        Then('every law holds')((s, expect) =>
          expect(outcomes(s.verdicts)).toEqual([
            'route-after-open: held',
            'observe-tree: held',
            'query-role-name: held',
            'fill-then-read: held',
            'tap-checkbox: held',
            'tree-rebuilds-after-acts: held',
            'tap-link-navigates: held',
            'screenshot-masks-without-requiring-a-match: held',
            'drag-capability: held',
            'logs-hold-load-evidence-once-open-returns: held',
            'navigation-records: held',
            'ambiguous-locator: held',
            'missing-locator: held',
            'close-ends-session-and-open-starts-fresh: held',
          ])
        ),
      ),
    )

    scenarioOutline(
      'A port fake whose DOM change is <sabotage> breaks exactly the laws over that change',
      [
        { sabotage: 'a fill that leaves the field untouched', broken: ['fill-then-read', 'tree-rebuilds-after-acts'] },
        { sabotage: 'a click that dispatches nothing', broken: ['tap-checkbox', 'tree-rebuilds-after-acts'] },
        { sabotage: 'a click that only ever checks', broken: ['tap-checkbox'] },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given(`the port fake with ${row.sabotage}`)('mutation', () => Effect.succeed(SABOTAGE[row.sabotage])),
          When('the engine laws are proven against it over the served law site')(
            'verdicts',
            ({ mutation }) => provenOverServedSite(mutation),
          ),
          Then('only the laws over that change are broken')((s, expect) =>
            expect(brokenLaws(s.verdicts)).toEqual(row.broken)
          ),
        ),
    )

    scenario(
      'A broken fill law shows the filled address against the empty field read back from the DOM',
      Gherkin.Do.pipe(
        When('the engine laws are proven against a port fake whose fill leaves the field untouched')(
          'verdicts',
          () => provenOverServedSite(SABOTAGE['a fill that leaves the field untouched']),
        ),
        Then('the fill law reports what it expected and what the DOM held')((s, expect) =>
          expect(s.verdicts.find((verdict) => verdict.law === 'fill-then-read')).toEqual({
            _tag: 'LawBroken',
            law: 'fill-then-read',
            expected: '{"_tag":"Value","value":"ada@example.com"}',
            observed: '{"_tag":"Value","value":""}',
          })
        ),
      ),
    )
  })
