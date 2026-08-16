/**
 * Checkpoint round-trip on docker (R14, U10's surface live): launch a
 * source container, write state, stop its workload (the canonical docker
 * commit flow — the daemon commits a stopped container's filesystem; a
 * pause-free rootless podman cannot pause a running container, so the
 * capture reads the stopped sandbox), capture a NAMED checkpoint
 * (`checkpointContainer` → the `rightsize/checkpoint:<name>` image ref),
 * rediscover it (`Checkpoints.find`/`list`), restore a container from it
 * through the executor (`checkpointSourceBackend` validated pre-I/O), and
 * prove the captured state survived via an exec — then
 * `Checkpoints.remove` retires the artifact and registry entry. Real
 * containers and a real `docker commit` — never a skip (RS-LANE).
 */
import { randomBytes } from 'node:crypto'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import type { Checkpoint } from '../../src/checkpoint/checkpoint.js'
import { checkpointContainer, Checkpoints } from '../../src/checkpoint/checkpoints.js'
import { restoreFromCheckpoint } from '../../src/checkpoint/from-checkpoint.js'
import { fromImage, type RunningContainer, toRunningContainer } from '../../src/generic-container.js'
import { launchContainer } from '../../src/lifecycle/launch.js'
import type { ExecResult } from '../../src/model/container-spec.js'
import { SandboxRuntime } from '../../src/runtime/runtime.js'
import { Wait } from '../../src/wait/strategies.js'
import { laneOutcome, outcomeFailure } from './helpers.js'
import { containerExists } from './probes.js'

const Feature = makeFeature({ it, layer })

const checkpointName = (): string => `rz-parity-ckpt-${randomBytes(6).toString('hex')}`

Feature('the checkpoint contract runs a real docker commit/restore round trip').liveClock().body(({ scenario }) => {
  scenario(
    'ShouldRestoreCommittedState_WhenANamedCheckpointRoundTripsOnDocker',
    Gherkin.Do.pipe(
      Given('a name for the checkpoint')('name', () => Effect.succeed(checkpointName())),
      Given('a source container whose workload logs a readiness marker and sleeps')(
        'source',
        () =>
          laneOutcome(
            fromImage('alpine:3.19')
              .withCommand('sh', '-c', 'echo ckpt-ready; sleep 60')
              .waitingFor(Wait.forLogMessage('ckpt-ready'))
              .withStartupTimeout(30_000)
              .start(),
          ),
      ),
      When('a state marker is written into its filesystem')('write', (s) =>
        s.source.ok && s.source.value !== undefined
          ? laneOutcome(s.source.value.execCommand('sh', '-c', 'echo state-marker > /state.txt && sync'))
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.source.failureMessage))),
      When('the workload is stopped without removing the sandbox')('stopped', (s) => {
        const container = s.source.ok && s.source.value !== undefined ? s.source.value : undefined
        return container === undefined
          ? Effect.succeed(outcomeFailure<void>('launch-failed', s.source.failureMessage))
          : laneOutcome(
            Effect.gen(function*() {
              const runtime = yield* SandboxRuntime
              return yield* runtime.stop(container.handle)
            }),
          )
      }),
      Then('the daemon still holds the stopped container — a commit target exists')((s) => {
        expect(s.stopped.ok).toBe(true)
        if (s.source.ok && s.source.value !== undefined) {
          expect(containerExists(s.source.value.handle.id)).toBe(true)
        }
      }),
      When('a named checkpoint captures the stopped container')(
        'captured',
        (s) =>
          s.source.ok && s.source.value !== undefined
            ? laneOutcome(checkpointContainer(s.source.value.handle, { name: s.name }))
            : Effect.succeed(outcomeFailure<Checkpoint>('launch-failed', s.source.failureMessage)),
      ),
      Then('the capture minted a deterministic docker image ref on the docker backend')((s) => {
        if (!s.captured.ok) {
          expect({ failureMessage: s.captured.failureMessage }).toEqual({ failureMessage: undefined })
          return
        }
        if (s.captured.value !== undefined) {
          expect(s.captured.value.backend).toBe('docker')
          expect(s.captured.value.ref).toBe(`rightsize/checkpoint:${s.name}`)
          expect(s.captured.value.spec.image).toBe('alpine:3.19')
        }
      }),
      When('the registry lists it and find rediscovers it')('registry', (s) =>
        Effect.all([
          laneOutcome(Checkpoints.find(s.name)),
          laneOutcome(Checkpoints.list),
        ])),
      Then('the checkpoint is visible to the Checkpoints surface with the same ref')((s) => {
        const found = s.registry[0]
        const list = s.registry[1]
        expect(found.ok).toBe(true)
        expect(found.value?.ref).toBe(`rightsize/checkpoint:${s.name}`)
        expect(list.ok).toBe(true)
        expect(list.value?.some((cp) => cp.ref === `rightsize/checkpoint:${s.name}`)).toBe(true)
      }),
      When('a container is restored from the checkpoint')('restored', (s) => {
        const captured = s.captured.ok && s.captured.value !== undefined ? s.captured.value : undefined
        if (captured === undefined) {
          return Effect.succeed(outcomeFailure<RunningContainer>('launch-failed', s.captured.failureMessage))
        }
        const restore = restoreFromCheckpoint(captured)
        return laneOutcome(
          Effect.map(
            launchContainer(restore.spec, { checkpointSourceBackend: restore.sourceBackend }),
            toRunningContainer,
          ),
        )
      }),
      Then('the restore boots a ready container from the committed image')((s) => {
        if (!s.restored.ok) {
          expect({ failureMessage: s.restored.failureMessage }).toEqual({ failureMessage: undefined })
          return
        }
        expect(s.restored.value).toBeDefined()
      }),
      When('an exec reads the captured marker from the restored container')(
        'read',
        (s) =>
          s.restored.ok && s.restored.value !== undefined
            ? laneOutcome(s.restored.value.execCommand('cat', '/state.txt'))
            : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.restored.failureMessage)),
      ),
      Then('the state survived the round trip')((s) => {
        expect(s.read.ok).toBe(true)
        expect(s.read.value?.exitCode).toBe(0)
        expect(s.read.value?.stdout.trim()).toBe('state-marker')
      }),
      When('the checkpoint is removed')('removed', (s) => laneOutcome(Checkpoints.remove(s.name))),
      When('find is retried after the removal')('gone', (s) => laneOutcome(Checkpoints.find(s.name))),
      Then('the checkpoint is gone from the registry and the backend')((s) => {
        expect(s.removed.ok).toBe(true)
        expect(s.removed.value).toBe(true)
        if (s.gone.ok && s.gone.value !== undefined) {
          expect(s.gone.value).toBeUndefined()
        } else {
          expect(s.gone.ok).toBe(true)
        }
      }),
      When('both containers are torn down')('cleanup', (s) =>
        Effect.all([
          s.source.ok && s.source.value !== undefined ? laneOutcome(s.source.value.stop) : Effect.void,
          s.restored.ok && s.restored.value !== undefined ? laneOutcome(s.restored.value.stop) : Effect.void,
        ])),
    ),
  )
})
