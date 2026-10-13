import { Gherkin, Given, it, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Readiness } from '@systemfsoftware/effect-readiness'
import { Effect } from 'effect'
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

const targetOf = (bindings: ReadonlyArray<Readiness.PortBinding>): Readiness.ProbeTargetBlueprint =>
  Readiness.target(bindings, TIGHT_WAIT)

const targetOfMappedGuest = Effect.gen(function*() {
  const guest = yield* GuestService
  return targetOf([bindingOf(guest.hostPort)])
})

const awaitOver = (target: Readiness.ProbeTargetBlueprint, condition: Readiness.Condition) =>
  target.awaitCondition(condition)

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
        Then('the check reports the service is ready')((state, expect) =>
          expect(state.verdict).toMatchObject({ _tag: 'Satisfied' })
        ),
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
        Then('the check gives up without reporting the service ready')((state, expect) =>
          expect(state.verdict).toMatchObject({ _tag: 'TimedOut' })
        ),
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
        Then('the check gives up without opening any host connection')((state, expect) =>
          expect(state.verdict).toMatchObject({ _tag: 'TimedOut' })
        ),
      ),
    )

    scenarioOutline(
      'An HTTP wait reporting <verdict> when the service answers <description>',
      [
        { answer: 'HTTP/1.0 200 OK', description: 'a success status', verdict: 'Satisfied' },
        { answer: 'HTTP/1.0 503 Service Unavailable', description: 'a server error', verdict: 'TimedOut' },
        { answer: 'NOT_HTTP_MALFORMED_GARBAGE\r\n\r\n', description: 'a malformed status line', verdict: 'TimedOut' },
        {
          answer: '200 OK\r\nConnection: close\r\n\r\n',
          description: 'a 2xx-looking status line carrying no protocol version',
          verdict: 'TimedOut',
        },
        {
          answer: 'HTTP/1.1 2000 Too Long\r\nConnection: close\r\n\r\n',
          description: 'a four-digit status code beginning with 200',
          verdict: 'TimedOut',
        },
        {
          answer: 'HTTP/ 200 OK\r\nConnection: close\r\n\r\n',
          description: 'a 2xx status line with an empty protocol version',
          verdict: 'TimedOut',
        },
        { answer: 'HTTP/1.1 200 OK\r\n', description: 'truncated headers without final crlf', verdict: 'Satisfied' },
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
          Then('the check reports readiness matching <verdict>')((state, expect) =>
            expect(state.verdict).toMatchObject({ _tag: row.verdict })
          ),
        ),
    )

    scenarioOutline(
      'An HTTP exchange answered with <description> reads back as <evidence>',
      [
        {
          answer: 'HTTP/1.1 600 Above Range\r\n\r\n',
          description: 'a status code above 599',
          evidence: { _tag: 'Refused' },
        },
        {
          answer: 'HTTP/1.1 099 Below Range\r\n\r\n',
          description: 'a status code below 100',
          evidence: { _tag: 'Refused' },
        },
        {
          answer: 'HTTP/1.1 599 Network Timeout\r\n\r\n',
          description: 'the highest status code',
          evidence: { _tag: 'Responded', statusCode: 599 },
        },
        {
          answer: 'HTTP/1.1 100 Continue\r\n\r\n',
          description: 'the lowest status code',
          evidence: { _tag: 'Responded', statusCode: 100 },
        },
      ] as const,
      (row) =>
        Gherkin.Do.pipe(
          Given('a guest service configured to respond with <description>')(
            'binding',
            () =>
              Effect.gen(function*() {
                const guest = yield* GuestService
                yield* guest.replyWith(row.answer)
                return bindingOf(guest.hostPort)
              }),
          ),
          When('the host prober exchanges a request for "/health"')(
            'evidence',
            ({ binding }) => Effect.flatMap(Readiness.HostProber, (prober) => prober.exchange(binding, '/health')),
          ),
          Then('the exchange reads back as <evidence>')((state, expect) =>
            expect(state.evidence).toEqual(row.evidence)
          ),
        ),
    )
  })
