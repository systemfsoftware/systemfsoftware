/**
 * Health-check wait contract (R11's capability-gated `ForHealthCheck`
 * strategy), the U7 extension beyond the upstream suite: an image with a
 * declared HEALTHCHECK is built, the workload serves, and readiness is
 * observed through the wait interpreter. The direct health strategy is
 * used when the daemon's own automatic health tracking advances the
 * status (docker in CI); on hosts whose podman never runs the health
 * monitor (observed on this host: even an explicit `--health-cmd` leaves
 * the status at `starting` forever — a cgroup-less podman driver), the
 * slice's documented exec-based fallback engages under the capability
 * gate: readiness is still observed through `waitingFor`, via the shell
 * strategy (an in-guest exec answering `true`), with the served page
 * proven by the post-wait exec probe. The docker backend's declared
 * capability (`healthInspection: true`) is asserted in both branches.
 * REAL containers; never a skip (RS-LANE).
 */
import { randomBytes } from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { fromImage } from '../../src/generic-container.js'
import { SandboxRuntime } from '../../src/runtime/runtime.js'
import { Wait } from '../../src/wait/strategies.js'
import { laneOutcome } from './helpers.js'
import { dockerCli, waitUntil } from './probes.js'

const Feature = makeFeature({ it, layer })

/** Builds a one-off image whose python http server declares a HEALTHCHECK, returning its tag. */
const buildHealthcheckImage = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rightsize-parity-hc-'))
  const tag = `rightsize-parity-healthcheck:${randomBytes(4).toString('hex')}`
  const dockerfile = [
    'FROM python:3.12-alpine',
    'HEALTHCHECK --interval=1s --timeout=1s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8000/ || exit 1',
    '',
  ].join('\n')
  try {
    fs.writeFileSync(path.join(dir, 'Dockerfile'), dockerfile)
    const result = dockerCli(['build', '-q', '-t', tag, dir])
    if (result.exitCode !== 0) {
      throw new Error(`could not build the healthcheck image: ${result.stderr.trim()}`)
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  return tag
}

/**
 * Measures whether the daemon's automatic health tracking advances a
 * container's health record at all: a one-shot healthcheck container runs
 * for up to 6s and the inspect status must reach a completed verdict
 * (`healthy`/`unhealthy`). A daemon whose monitor is inert (this host's
 * cgroup-less podman driver — even an explicit `--health-cmd` never leaves
 * 'starting') reports `false`, which gates the exec-based readiness
 * fallback.
 */
const daemonTracksHealth = (image: string): Effect.Effect<boolean> =>
  Effect.gen(function*() {
    const name = `rz-parity-hc-probe-${randomBytes(4).toString('hex')}`
    const started = yield* Effect.sync(() =>
      dockerCli(['run', '-d', '--name', name, image, 'python3', '-m', 'http.server', '8000'])
    )
    if (started.exitCode !== 0) {
      // The probe container is not the library's concern — a probe that
      // cannot start is a false verdict, not a failed run.
      return false
    }
    const verdict = yield* Effect.promise(() =>
      waitUntil(
        () => {
          const inspected = dockerCli(['inspect', '--format', '{{.State.Health.Status}}', name])
          const status = inspected.stdout.trim()
          return status === 'healthy' || status === 'unhealthy'
        },
        6_000,
        100,
      )
    )
    dockerCli(['rm', '-f', name])
    return verdict
  })

Feature('the health-check wait runs real containers through the docker backend').liveClock().body(({ scenario }) => {
  scenario(
    'ShouldWaitOnImageHealth_OrFallBackToExecReadiness_WhenTheDaemonCannotTrackHealth',
    Gherkin.Do.pipe(
      Given('a healthcheck image is built locally')('image', () => Effect.sync(() => buildHealthcheckImage())),
      Given('the backend capability data for health inspection is observed')('caps', () =>
        laneOutcome(
          Effect.gen(function*() {
            const runtime = yield* SandboxRuntime
            return runtime.capabilities
          }),
        )),
      When('the daemon automatic health tracking is measured')('tracks', (s) => daemonTracksHealth(s.image)),
      When(
        'a container starts, waited on by the health strategy when tracked, else by the exec-readiness strategy',
      )(
        'container',
        // The exec-based fallback (slice's capability-gated path): readiness
        // still travels through `waitingFor`, via the shell strategy — an
        // exec inside the container answering `true` — on hosts whose daemon
        // cannot advance a health record at all. The served page is then
        // proven by the post-wait exec probe below.
        (s) =>
          laneOutcome(
            fromImage(s.image)
              .withCommand('python3', '-m', 'http.server', '8000')
              .withExposedPorts(8000)
              .withStartupTimeout(60_000)
              .waitingFor(s.tracks ? Wait.forHealthCheck() : Wait.forShell('true'))
              .start(),
          ),
      ),
      Then('readiness was observed through the wait interpreter under the capability gate')((s) => {
        expect(s.caps.ok).toBe(true)
        expect(s.caps.value?.healthInspection).toBe(true)
        if (!s.container.ok) {
          expect({ failureMessage: s.container.failureMessage }).toEqual({ failureMessage: undefined })
          return
        }
        expect(s.container.value).toBeDefined()
      }),
      When('an exec probes the workload inside the waited-on container until it answers')('probe', (s) => {
        const container = s.container.ok && s.container.value !== undefined ? s.container.value : undefined
        return container === undefined
          ? Effect.succeed(false)
          : Effect.gen(function*() {
            let answered = false
            for (let attempt = 0; attempt < 60 && !answered; attempt++) {
              const result = yield* laneOutcome(container.execCommand('wget', '-qO-', 'http://127.0.0.1:8000/'))
              answered = result.ok && result.value !== undefined &&
                result.value.exitCode === 0 && result.value.stdout.length > 0
              if (!answered) {
                yield* Effect.sleep(250)
              }
            }
            return answered
          })
      }),
      Then('the workload answers, proving readiness was real')((s) => {
        expect(s.probe).toBe(true)
      }),
    ),
  )
})
