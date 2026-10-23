import { LawVerdict, prove } from '@systemfsoftware/effect-e2e-conformance'
import { Engine, type Locator } from '@systemfsoftware/effect-e2e/engine'
import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'

import { brokenSubject } from './__fixtures__/broken-engines.js'
import { everyCapability, LAW_ORIGIN, lawSite, memorySubject, webOnly } from './__fixtures__/law-site.js'

const Feature = makeFeature({ it })

const outcomes = (verdicts: ReadonlyArray<LawVerdict>): ReadonlyArray<string> =>
  verdicts.map((verdict) =>
    LawVerdict.match(verdict, {
      LawHeld: ({ law }) => `${law}: held`,
      LawSkipped: ({ law }) => `${law}: skipped`,
      LawBroken: ({ law }) => `${law}: broken`,
    })
  )

const brokenLaws = (verdicts: ReadonlyArray<LawVerdict>): ReadonlyArray<string> =>
  verdicts.filter(LawVerdict.guards.LawBroken).map(({ law }) => law)

const button = (name: string): Locator => ({
  expression: { kind: 'ByRole', role: 'button', name: { value: name, exact: true } },
  label: `the ${name} button`,
})

Feature('Proving an engine against the engine laws')
  .withLayer(Layer.empty)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'An engine that declares every capability keeps every law it can be held to',
      Gherkin.Do.pipe(
        Given('the in-memory engine over the law site, declaring every capability')(
          'subject',
          () => Effect.succeed(memorySubject(everyCapability)),
        ),
        When('the engine laws are proven against it')('verdicts', ({ subject }) => prove(subject)),
        Then('every law holds, and the drag law steps aside because dragging is declared')((s, expect) =>
          expect(outcomes(s.verdicts)).toEqual([
            'route-after-open: held',
            'observe-tree: held',
            'query-role-name: held',
            'fill-then-read: held',
            'tap-checkbox: held',
            'tap-link-navigates: held',
            'screenshot: held',
            'drag-capability: skipped',
            'console-network-evidence: held',
            'ambiguous-locator: held',
            'missing-locator: held',
            'close-ends-session: held',
          ])
        ),
      ),
    )

    scenario(
      'An engine that declares only the web capability refuses what it does not declare and keeps every law',
      Gherkin.Do.pipe(
        Given('the in-memory engine over the law site, declaring only web')(
          'subject',
          () => Effect.succeed(memorySubject(webOnly)),
        ),
        When('the engine laws are proven against it')('verdicts', ({ subject }) => prove(subject)),
        Then('every law holds')((s, expect) =>
          expect(outcomes(s.verdicts)).toEqual([
            'route-after-open: held',
            'observe-tree: held',
            'query-role-name: held',
            'fill-then-read: held',
            'tap-checkbox: held',
            'tap-link-navigates: held',
            'screenshot: held',
            'drag-capability: held',
            'console-network-evidence: held',
            'ambiguous-locator: held',
            'missing-locator: held',
            'close-ends-session: held',
          ])
        ),
      ),
    )

    scenario(
      'An ambiguous, a missing and an undeclared request each fail with their own engine failure',
      { scenarioLayer: Engine.layerTest(lawSite(webOnly)) },
      Gherkin.Do.pipe(
        Given('the form page is open on an engine that declares only web')(
          'engine',
          () => Effect.tap(Engine, (engine) => engine.open(`${LAW_ORIGIN}/form`)),
        ),
        When('a test taps Delete, taps Nowhere and asks for a screenshot')('failures', ({ engine }) =>
          Effect.all({
            ambiguous: Effect.flip(engine.act({ _tag: 'Tap', target: button('Delete') })),
            missing: Effect.flip(engine.act({ _tag: 'Tap', target: button('Nowhere') })),
            undeclared: Effect.flip(engine.screenshot({ mask: [] })),
          })),
        Then('each names what went wrong')((s, expect) =>
          expect({
            ambiguous: s.failures.ambiguous,
            missing: s.failures.missing,
            undeclared: s.failures.undeclared,
            missingNamesTheQuery: s.failures.missing.message.includes('Nowhere'),
            undeclaredNamesTheCapability: s.failures.undeclared.message.includes('screenshot'),
          }).toMatchObject({
            ambiguous: { _tag: 'LOCATOR_AMBIGUOUS', evidence: [{ _tag: 'NodeEvidence' }, { _tag: 'NodeEvidence' }] },
            missing: { _tag: 'LOCATOR_NOT_FOUND' },
            undeclared: { _tag: 'AUTOMATION_UNSUPPORTED' },
            missingNamesTheQuery: true,
            undeclaredNamesTheCapability: true,
          })
        ),
      ),
    )

    scenarioOutline(
      'An engine whose <method> misbehaves breaks exactly the laws over it',
      [
        { method: 'read', broken: ['fill-then-read'] },
        { method: 'query', broken: ['query-role-name'] },
        { method: 'act', broken: ['ambiguous-locator'] },
        { method: 'screenshot', broken: ['screenshot'] },
        { method: 'route', broken: ['route-after-open', 'tap-link-navigates'] },
        { method: 'logs', broken: ['console-network-evidence'] },
        { method: 'observe', broken: ['observe-tree'] },
        { method: 'close', broken: ['close-ends-session'] },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given(`the in-memory engine with a broken ${row.method}`)('subject', () =>
            Effect.succeed(brokenSubject(row.method))),
          When('the engine laws are proven against it')('verdicts', ({ subject }) =>
            prove(subject)),
          Then('only the laws over that method are broken')((s, expect) =>
            expect(brokenLaws(s.verdicts)).toEqual(row.broken)
          ),
        ),
    )

    scenario(
      'A broken law shows what it expected and what the engine did',
      Gherkin.Do.pipe(
        Given('the in-memory engine whose reads ignore what was filled')(
          'subject',
          () => Effect.succeed(brokenSubject('read')),
        ),
        When('the engine laws are proven against it')('verdicts', ({ subject }) => prove(subject)),
        Then('the fill law reports the filled address against the empty value read back')((s, expect) =>
          expect(s.verdicts.filter(LawVerdict.guards.LawBroken)).toEqual([
            {
              _tag: 'LawBroken',
              law: 'fill-then-read',
              expected: '{"_tag":"Value","value":"ada@example.com"}',
              observed: '{"_tag":"Value","value":""}',
            },
          ])
        ),
      ),
    )
  })
