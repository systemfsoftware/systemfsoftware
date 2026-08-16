/**
 * Smoke: the parity lane harness runs a REAL container through the docker
 * backend — provision check, exec, and scope teardown. This file is
 * deliberately small: it exists to prove the lane wiring (layer composition,
 * discovery, launch cell) before the ported contract suite grows in the
 * sibling files.
 */
import { And, Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { fromImage } from '../../src/generic-container.js'
import { launchContainer } from '../../src/lifecycle/launch.executor.js'
import type { ExecResult } from '../../src/model/container-spec.schema.js'
import { laneOutcome, outcomeFailure } from './helpers.js'

const Feature = makeFeature({ it, layer })

Feature('the parity lane drives a real container through the docker backend').liveClock().body(({ scenario }) => {
  scenario(
    'Should_exec_When_a_real_container_starts_through_the_facade',
    Gherkin.Do.pipe(
      When('a real alpine container starts through the facade')(
        'container',
        () => laneOutcome(fromImage('alpine:3.19').withCommand('sleep', '60').start()),
      ),
      Given('an exec runs inside it')('exec', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(s.container.value.execCommand('sh', '-c', 'echo smoke-ok'))
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
      Then('the launch succeeded and the exec exited 0 with the expected stdout')((ss) => {
        expect(ss.container.ok).toBe(true)
        expect(ss.exec.ok, `exec failed: ${ss.exec.failureMessage ?? ''}`).toBe(true)
        if (ss.exec.ok && ss.exec.value !== undefined) {
          expect(ss.exec.value.exitCode).toBe(0)
          expect(ss.exec.value.stdout.trim()).toBe('smoke-ok')
        }
      }),
      And('the container name follows the run-prefixed scheme')((s) => {
        if (s.container.ok && s.container.value !== undefined) {
          expect(s.container.value.spec.name).toMatch(/^rz-/)
        }
      }),
    ),
  )

  scenario(
    'Should_launch_a_container_through_the_executor_directly',
    Gherkin.Do.pipe(
      When('a spec is launched through the launch executor')(
        'handle',
        () => laneOutcome(launchContainer(fromImage('alpine:3.19').withCommand('sleep', '60').spec)),
      ),
      Then('the executor produced a running handle whose backend is docker')((s) => {
        expect(s.handle.ok).toBe(true)
        if (s.handle.ok && s.handle.value !== undefined) {
          expect(s.handle.value.backend).toBe('docker')
          expect(s.handle.value.handle.id).toBeTruthy()
        }
      }),
    ),
  )
})
