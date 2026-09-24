import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect, Match } from 'effect'
import { expect } from 'vitest'
import { GuestService } from './__fixtures__/guest-service.fixture.js'
import { scenarioEnvironment } from './__fixtures__/readiness-environment.fixture.js'

const Feature = makeFeature({ it })

const GUEST_PORT = 8080
const TIGHT_WAIT = { timeoutMs: 300, pollMs: 25 } as const

const bindingOf = (hostPort: number): Readiness.PortBinding => ({
  guest: GUEST_PORT,
  host: '127.0.0.1',
  hostPort,
})

const targetOf = (bindings: ReadonlyArray<Readiness.PortBinding>): Readiness.ProbeTarget =>
  Readiness.target(bindings, TIGHT_WAIT)

const targetOfMappedGuest = Effect.gen(function*() {
  const guest = yield* GuestService
  return targetOf([bindingOf(guest.hostPort)])
})

const awaitOver = (target: Readiness.ProbeTarget, condition: Readiness.Condition) =>
  Readiness.awaitCondition(target, condition)

const reportedReady = (verdict: Readiness.Satisfied | Readiness.TimedOut): boolean =>
  Match.value(verdict).pipe(
    Match.tag('Satisfied', () => true),
    Match.tag('TimedOut', () => false),
    Match.exhaustive,
  )

Feature('Probing guest network services for readiness')
  .live('scenarios probe a real guest service over loopback sockets the kernel cannot observe')
  .withScenarioLayer(scenarioEnvironment)
  .body(({ scenario, scenarioOutline }) => {
    scenario(
      'A service already accepting connections becomes ready on the first attempt',
      Gherkin.Do.pipe(
        Given('a guest service deployed on mapped port 8080')('target', () => targetOfMappedGuest),
        When('readiness is checked for a service answering on the port')(
          'verdict',
          ({ target }) => awaitOver(target, Readiness.Wait.forTcp(GUEST_PORT)),
        ),
        Then('the check reports the service is ready')(({ verdict }) => {
          expect(reportedReady(verdict)).toBe(true)
        }),
      ),
    )

    scenario(
      'A mapped port with nothing listening behind it never becomes ready',
      Gherkin.Do.pipe(
        Given('a mapped port with no active listener behind it')(
          'target',
          () =>
            Effect.gen(function*() {
              const guest = yield* GuestService
              yield* guest.release
              return targetOf([bindingOf(guest.hostPort)])
            }),
        ),
        When('readiness is checked for a service behind the port')(
          'verdict',
          ({ target }) => awaitOver(target, Readiness.Wait.forTcp(GUEST_PORT)),
        ),
        Then('the check gives up without reporting the service ready')(({ verdict }) => {
          expect(reportedReady(verdict)).toBe(false)
        }),
      ),
    )

    scenario(
      'A guest port that was never mapped never becomes ready',
      Gherkin.Do.pipe(
        Given('a guest service running with port 8080 unexposed')('target', () => Effect.succeed(targetOf([]))),
        When('readiness is checked for that unmapped port')(
          'verdict',
          ({ target }) => awaitOver(target, Readiness.Wait.forTcp(GUEST_PORT)),
        ),
        Then('the check gives up without opening any host connection')(({ verdict }) => {
          expect(reportedReady(verdict)).toBe(false)
        }),
      ),
    )

    scenarioOutline(
      'An HTTP wait reporting <ready> when the service answers <description>',
      [
        { answer: 'HTTP/1.0 200 OK', description: 'a success status', ready: true },
        { answer: 'HTTP/1.0 503 Service Unavailable', description: 'a server error', ready: false },
        { answer: 'NOT_HTTP_MALFORMED_GARBAGE\r\n\r\n', description: 'a malformed status line', ready: false },
        { answer: 'HTTP/1.1 200 OK\r\n', description: 'truncated headers without final crlf', ready: true },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a guest service configured to respond with <description>')(
            'target',
            () =>
              Effect.gen(function*() {
                const guest = yield* GuestService
                yield* guest.replyWith(row.answer)
                return targetOf([bindingOf(guest.hostPort)])
              }),
          ),
          When('readiness is checked for health path "/health"')(
            'verdict',
            ({ target }) => awaitOver(target, Readiness.Wait.forHttp('/health', GUEST_PORT)),
          ),
          Then('the check reports readiness matching <ready>')(({ verdict }) => {
            expect(reportedReady(verdict)).toBe(row.ready)
          }),
        ),
    )
  })
