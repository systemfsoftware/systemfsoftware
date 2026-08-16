/**
 * Network lifecycle contract (R5/R7/R12), extending the upstream suite:
 * a library-created network, two containers joined with alias endpoints,
 * cross-container alias DNS resolution over docker's native bridge
 * (`getHost` networking: a peer resolves the sibling's alias and fetches
 * its HTTP server THROUGH the network), and the last-member teardown —
 * stopping the first member leaves the network, stopping the last member
 * removes it (verified out-of-band via the `networkExists` probe). Real
 * containers, real bridge networks (RS-LANE).
 */
import { randomBytes } from 'node:crypto'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { fromImage } from '../../src/generic-container.js'
import type { ExecResult } from '../../src/model/container-spec.js'
import { Wait } from '../../src/wait/strategies.js'
import { laneOutcome, outcomeFailure } from './helpers.js'
import { networkExists } from './probes.js'

const Feature = makeFeature({ it, layer })

const networkId = (): string => `rz-parity-net-${randomBytes(4).toString('hex')}`

Feature('the network contract runs real containers through the docker backend').liveClock().body(({ scenario }) => {
  scenario(
    'ShouldResolvePeerAliasesAndRemoveTheNetworkWithItsLastMember',
    Gherkin.Do.pipe(
      Given('a network id')('network', () => Effect.succeed(networkId())),
      Given('an http server container joined with the alias srv')('server', (s) =>
        laneOutcome(
          fromImage('python:3.12-alpine')
            .withNetwork(s.network)
            .withNetworkAliases('srv')
            .withCommand('python3', '-m', 'http.server', '8000')
            .withExposedPorts(8000)
            .withStartupTimeout(30_000)
            .waitingFor(Wait.forHttp('/', { port: 8000 }))
            .start(),
        )),
      Given('a client container joined with the alias client')('client', (s) =>
        laneOutcome(
          fromImage('alpine:3.19')
            .withNetwork(s.network)
            .withNetworkAliases('client')
            .withCommand('sleep', '60')
            .withStartupTimeout(30_000)
            .start(),
        )),
      Then('both members are running on the docker handle with loopback host binding')((s) => {
        expect(s.server.ok).toBe(true)
        expect(s.client.ok).toBe(true)
        expect(s.server.value?.getHost()).toBe('127.0.0.1')
        expect(s.client.value?.getHost()).toBe('127.0.0.1')
      }),
      When('the client resolves the server alias')('dns', (s) =>
        s.client.ok && s.client.value !== undefined
          ? laneOutcome(s.client.value.execCommand('sh', '-c', 'getent hosts srv'))
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.client.failureMessage))),
      Then('the alias resolved to an address through docker DNS')((s) => {
        expect(s.dns.ok).toBe(true)
        if (s.dns.ok && s.dns.value !== undefined) {
          expect(s.dns.value.exitCode).toBe(0)
          expect(s.dns.value.stdout.trim().length).toBeGreaterThan(0)
        }
      }),
      When('the client fetches the server over the alias')('fetch', (s) =>
        s.client.ok && s.client.value !== undefined
          ? laneOutcome(s.client.value.execCommand('wget', '-qO-', 'http://srv:8000/'))
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.client.failureMessage))),
      Then('the fetch over the alias returned the http server payload')((s) => {
        expect(s.fetch.ok).toBe(true)
        if (s.fetch.ok && s.fetch.value !== undefined) {
          expect(s.fetch.value.exitCode).toBe(0)
          expect(s.fetch.value.stdout.length).toBeGreaterThan(0)
        }
      }),
      When('the server member stops first')(
        'serverStopped',
        (s) => laneOutcome(s.server.ok && s.server.value !== undefined ? s.server.value.stop : Effect.void),
      ),
      Then('the network still exists while any member remains')((s) => {
        expect(s.serverStopped.ok).toBe(true)
        expect(networkExists(s.network)).toBe(true)
      }),
      When('the last member stops')(
        'clientStopped',
        (s) => laneOutcome(s.client.ok && s.client.value !== undefined ? s.client.value.stop : Effect.void),
      ),
      Then('the network was removed together with its last member')((s) => {
        expect(s.clientStopped.ok).toBe(true)
        expect(networkExists(s.network)).toBe(false)
      }),
    ),
  )
})
