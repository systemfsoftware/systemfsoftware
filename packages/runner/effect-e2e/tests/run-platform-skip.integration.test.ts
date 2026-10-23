import type { TestPlatform } from '@systemfsoftware/effect-e2e'
import { admitTest } from '@systemfsoftware/effect-e2e/run'
import { Gherkin, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'

import { GREET_SITE } from './__fixtures__/agent-sites.fixture.js'
import { countedEngine, inTry, targetOf, TEST, worldOf } from './__fixtures__/run-sessions.fixture.js'

const Feature = makeFeature({ it })

const declaredFor = (platforms: ReadonlyArray<TestPlatform>) =>
  Effect.gen(function*() {
    const world = yield* worldOf({ mode: 'read-write', answers: [] })
    const engine = yield* countedEngine(GREET_SITE)
    const admission = yield* admitTest({
      log: world.log,
      test: TEST,
      target: targetOf(world),
      agent: 'default',
      platforms,
    })
    yield* Match.valueTags(admission, {
      Admitted: () =>
        inTry({
          world,
          retry: 0,
          engine: engine.source,
          body: (session) => session.endAttempt({ _tag: 'Finished', errors: [] }),
        }),
      PlatformSkipped: () => Effect.void,
    })
    const verdict = yield* world.log.verdict
    return {
      attempts: (yield* world.log.entries).map((entry) =>
        Match.valueTags(entry.attempt, {
          Ran: ({ id, status }) => ({ ran: id, status }),
          Skipped: ({ id, reason }) => ({ skipped: id, reason }),
        })
      ),
      acquisitions: yield* engine.acquisitions,
      verdict: [verdict.status, verdict.exitCode],
    }
  })

Feature('Skipping a test declared for platforms its target does not run')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A test declared for iOS on a web target is skipped with a reason and the run exits 0',
      Gherkin.Do.pipe(
        When("a test declared with platforms ['ios'] is admitted against the web target")(
          'state',
          () => declaredFor(['ios']),
        ),
        Then('one skipped attempt names both platforms, no engine is opened, and the run passes')((s, expect) =>
          expect(s.state).toEqual({
            attempts: [{ skipped: 'attempt-0', reason: 'declared for ios; target "web" runs on web' }],
            acquisitions: 0,
            verdict: ['passed', 0],
          })
        ),
      ),
    )

    scenario(
      'A test declared for web among other platforms runs on the web target',
      Gherkin.Do.pipe(
        When("a test declared with platforms ['web', 'ios'] is admitted against the web target")(
          'state',
          () => declaredFor(['web', 'ios']),
        ),
        Then('the gate records nothing and the test runs its one try')((s, expect) =>
          expect(s.state).toEqual({
            attempts: [{ ran: 'attempt-0', status: 'passed' }],
            acquisitions: 0,
            verdict: ['passed', 0],
          })
        ),
      ),
    )
  })
