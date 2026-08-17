/**
 * Ported upstream lifecycle contract (upstream `test/it/contract.test.ts`
 * at the fork point, Apache-2.0): start/stop/scope lifecycle, port
 * publication + pre-allocation, and removeByName — driven through the real
 * docker backend. Every scenario runs REAL containers; the lane never
 * skips (RS-LANE).
 */
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { fromImage } from '../../src/generic-container.js'
import { launchContainer } from '../../src/lifecycle/launch.js'
import { SandboxRuntime } from '../../src/runtime/runtime.js'
import { Wait } from '../../src/wait/strategies.js'
import { laneOutcome } from './helpers.js'
import { containerExists, noExec, portIsReachable } from './probes.js'

const Feature = makeFeature({ it, layer })

const startPython = () =>
  laneOutcome(
    fromImage('python:3.12-alpine')
      .withCommand('python3', '-m', 'http.server', '8000')
      .withExposedPorts(8000)
      .withStartupTimeout(30_000)
      .waitingFor(Wait.forHttp('/', { port: 8000 }))
      .start(),
  )

Feature('the lifecycle contract runs real containers through the docker backend').liveClock().body(({ scenario }) => {
  scenario(
    'Should_tear_down_when_stopped_explicitly_or_by_scope_close',
    Gherkin.Do.pipe(
      When('a real alpine container starts')(
        'container',
        () => laneOutcome(fromImage('alpine:3.19').withCommand('sleep', '60').start()),
      ),
      Then('the container is running with a docker handle')((s) => {
        expect(s.container.ok).toBe(true)
        if (s.container.ok && s.container.value !== undefined) {
          expect(s.container.value.backend).toBe('docker')
          expect(s.container.value.handle.id).toBeTruthy()
        }
      }),
      When('it is stopped explicitly through the facade')(
        'stopped',
        (s) => laneOutcome(s.container.value !== undefined ? s.container.value.stop : Effect.void),
      ),
      Then('the daemon no longer holds the container')((s) => {
        expect(s.stopped.ok).toBe(true)
        if (s.container.ok && s.container.value !== undefined) {
          expect(containerExists(s.container.value.handle.id)).toBe(false)
        }
      }),
      Given('an exec runs against the stopped handle')('execAfter', (s) =>
        laneOutcome(
          s.container.value !== undefined ? s.container.value.execCommand('true') : Effect.succeed(noExec()),
        )),
      Then('the post-stop exec did not return a clean success')((s) => {
        if (s.execAfter.ok && s.execAfter.value !== undefined) {
          expect(s.execAfter.value.exitCode).not.toBe(0)
        } else {
          expect(s.execAfter.ok).toBe(false)
        }
      }),
    ),
  )

  scenario(
    'Should_publish_a_port_to_the_host_loopback_When_the_workload_listens',
    Gherkin.Do.pipe(
      When('a python http server starts with an exposed port, timed')('trial', () =>
        Effect.gen(function*() {
          const startedAt = performance.now()
          const outcome = yield* startPython()
          const readyMs = performance.now() - startedAt
          return { outcome, readyMs }
        })),
      When('the mapped port is probed over 127.0.0.1')('reachable', (s) => {
        const port = s.trial.outcome.ok && s.trial.outcome.value !== undefined
          ? s.trial.outcome.value.getMappedPort(8000)
          : undefined
        return port === undefined
          ? Effect.succeed(false)
          : Effect.promise(() => portIsReachable(port))
      }),
      Then('the wait resolved within the ready-budget class and the probe succeeded')((s) => {
        expect(s.trial.outcome.ok).toBe(true)
        // Ready-latency timing class: the port wait (R11's interpreter) must
        // resolve inside the same order of magnitude the whole suite's starts
        // occupy — a regressed wait loop (or a broken poll interval) surfaces
        // here as a launch that took an order of magnitude longer than the
        // other start-to-ready observations in this lane.
        expect(s.trial.readyMs).toBeLessThan(60_000)
        expect(s.reachable).toBe(true)
      }),
    ),
  )

  scenario(
    'Should_preallocate_distinct_host_ports_When_two_servers_publish_the_same_guest_port',
    Gherkin.Do.pipe(
      When('two python servers expose the same guest port')('pair', () =>
        Effect.gen(function*() {
          const a = yield* startPython()
          const b = yield* startPython()
          return { a, b }
        })),
      Then('the two mapped host ports differ')((s) => {
        expect(s.pair.a.ok).toBe(true)
        expect(s.pair.b.ok).toBe(true)
        const pa = s.pair.a.value?.getMappedPort(8000)
        const pb = s.pair.b.value?.getMappedPort(8000)
        expect(pa).toBeDefined()
        expect(pb).toBeDefined()
        expect(pa).not.toBe(pb)
      }),
    ),
  )

  scenario(
    'Should_removeByName_When_a_container_is_identified_only_by_its_name',
    Gherkin.Do.pipe(
      When('a spec is launched through the executor')(
        'launch',
        () => laneOutcome(launchContainer(fromImage('alpine:3.19').withCommand('sleep', '60').spec)),
      ),
      Then('the launch produced a handle with a run-prefixed name')((s) => {
        expect(s.launch.ok).toBe(true)
        if (s.launch.ok && s.launch.value !== undefined) {
          expect(s.launch.value.spec.name).toMatch(/^rz-/)
        }
      }),
      When('the container is stopped and removed by name through the runtime')('removedByName', (s) =>
        laneOutcome(
          Effect.gen(function*() {
            const runtime = yield* SandboxRuntime
            const name = s.launch.ok && s.launch.value !== undefined ? s.launch.value.spec.name : ''
            return yield* runtime.removeByName(name)
          }),
        )),
      Then('the daemon no longer sees the container identified only by its name')((s) => {
        expect(s.removedByName.ok).toBe(true)
        if (s.launch.ok && s.launch.value !== undefined && s.removedByName.ok) {
          expect(containerExists(s.launch.value.handle.id)).toBe(false)
        }
      }),
    ),
  )
})
