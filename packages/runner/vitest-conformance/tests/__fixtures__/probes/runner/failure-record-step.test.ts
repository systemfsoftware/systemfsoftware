import { Gherkin, Given, it, makeFeature, Then } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, Layer } from 'effect'
import { Unauthorized } from './failure-record-step.fixture.js'

const Feature = makeFeature({ it })

Feature('Failing step record')
  .withLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A Given step fails with a message-less error',
      Gherkin.Do.pipe(
        Given('a user logs in')('login', () => Effect.fail(new Unauthorized({ user: 'bob' }))),
        Then('the login is accepted')((s, expect) => expect(s.login).toEqual('ok')),
      ),
    )
  })
