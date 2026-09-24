import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import * as Effect from 'effect/Effect'
import { pipe } from 'effect/Function'
import * as Layer from 'effect/Layer'
import { expect } from 'vitest'

import { isContainer, job, make, withPort, withWorkdir } from './__fixtures__/container.blueprint.js'
import { exec, isRunningContainer, make as running } from './__fixtures__/running-container.handle.js'

const Feature = makeFeature({ it })

const countingDriver = { exec: (cmd: string) => Promise.resolve(cmd.length) }

Feature('Declaring a container and the running instance it becomes')
  .withScenarioLayer(Layer.empty)
  .body(({ scenario }) => {
    scenario(
      'A container configured by method or by pipe describes the same instance',
      Gherkin.Do.pipe(
        Given('a container for the redis:7 image')('base', () => Effect.succeed(make('redis:7'))),
        When('port 6379 is added once by method and once through a pipe')('configured', (s) =>
          Effect.succeed({
            byMethod: s.base.withPort(6379),
            byPipe: pipe(s.base, withPort(6379)),
            byCall: withPort(s.base, 6379),
          })),
        Then('all three describe redis:7 listening on 6379')((s) => {
          expect(s.configured.byMethod.spec.ports).toEqual([6379])
          expect(s.configured.byPipe.spec).toEqual(s.configured.byMethod.spec)
          expect(s.configured.byCall.spec).toEqual(s.configured.byMethod.spec)
        }),
        Then('the container it started from still has no ports')((s) => {
          expect(s.base.spec.ports).toEqual([])
        }),
      ),
    )

    scenario(
      'A configured container becomes a running instance only when asked for one',
      Gherkin.Do.pipe(
        Given('a container for the redis:7 image on port 6379')(
          'container',
          () => Effect.succeed(make('redis:7').withPort(6379)),
        ),
        When('the running instance is taken and asked to run "ping"')(
          'answer',
          (s) => Effect.flatMap(s.container.scoped, exec('ping')),
        ),
        Then('the instance answers through its driver')((s) => {
          expect(s.answer).toBe(4)
        }),
      ),
    )

    scenario(
      'A running container shows its identity and keeps its driver out of reach',
      Gherkin.Do.pipe(
        Given('a running container named redis over a counting driver')(
          'instance',
          () => Effect.succeed(running({ id: 'redis', driver: countingDriver })),
        ),
        When('its visible fields are listed')('fields', (s) => Effect.succeed(Object.keys(s.instance).sort())),
        Then('only its name and pipe are visible')((s) => {
          expect(s.fields).toEqual(['id', 'pipe'])
          expect(s.instance.id).toBe('redis')
        }),
      ),
    )

    scenario(
      'Something that merely looks like a container is not taken for one',
      Gherkin.Do.pipe(
        Given('a real container and a lookalike with the same fields')(
          'candidates',
          () => Effect.succeed({ real: make('redis:7'), lookalike: { spec: make('redis:7').spec, withPort: () => 0 } }),
        ),
        When('each is checked as a container and as a running instance')('verdicts', (s) =>
          Effect.succeed({
            real: isContainer(s.candidates.real),
            lookalike: isContainer(s.candidates.lookalike),
            realAsRunning: isRunningContainer(s.candidates.real),
          })),
        Then('only the real container is recognised, and never as a running instance')((s) => {
          expect(s.verdicts).toEqual({ real: true, lookalike: false, realAsRunning: false })
        }),
      ),
    )

    scenario(
      'A job ignores ports and runs in the working folder it was given',
      Gherkin.Do.pipe(
        Given('a job for the alpine image')('base', () => Effect.succeed(job('alpine'))),
        When('port 80 is added through the shared pipe step and the working folder is set to /srv, then the job runs')(
          'outcome',
          (s) => {
            const configured = pipe(s.base, withPort(80), withWorkdir('/srv'))
            return Effect.map(configured.run, (folder) => ({ configured, folder }))
          },
        ),
        Then('the job has no ports and ran in /srv')((s) => {
          expect(s.outcome.configured.spec.ports).toEqual([])
          expect(s.outcome.folder).toBe('/srv')
        }),
      ),
    )
  })
