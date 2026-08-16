/**
 * Mounts + msb-only capability contract, ported from upstream
 * `test/it/contract.test.ts`: bind-mounts (a host file and a host
 * directory mounted before boot are read-write VIEWS — an in-guest write
 * reaches the host path, and the host write is visible in the guest), and
 * the msb-only root-disk flags, which docker IGNORES: `withTmpfsRoot` /
 * `withDiskLimit` / `withNetworkDisabled` specs boot normally on docker
 * and behave as ordinary containers (the create body never reads those
 * fields). The capability gate is asserted as DATA: the docker backend's
 * declared `RuntimeCapabilities` say exactly what docker can and cannot do,
 * and the workflow gates on those flags pre-I/O — on docker these fields
 * are inert, not rejected and not enforced. Real containers only (RS-LANE).
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { fromImage } from '../../src/generic-container.js'
import type { ExecResult } from '../../src/model/container-spec.js'
import { SandboxRuntime } from '../../src/runtime/runtime.js'
import { Wait } from '../../src/wait/strategies.js'
import { laneOutcome, outcomeFailure } from './helpers.js'
import { portIsReachable } from './probes.js'

const Feature = makeFeature({ it, layer })

/** The docker backend's declared execution-model capability set (capabilities.schema). */
const DOCKER_CAPABILITIES = {
  hardwareIsolated: false,
  checkpoint: true,
  checkpointRestartsWorkload: false,
  supportsNativeNetworks: true,
  healthInspection: true,
}

Feature('the mount and capability contract runs real containers through the docker backend').liveClock().body(
  ({ scenario }) => {
    scenario(
      'ShouldServeABindMountedHostDirectoryReadWrite_WhenStartedViaTheFacade',
      Gherkin.Do.pipe(
        Given('a temp host directory with a seeded file')('fixture', () => {
          const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rightsize-parity-mount-'))
          fs.writeFileSync(path.join(dir, 'mounted.txt'), 'seed\n')
          fs.chmodSync(path.join(dir, 'mounted.txt'), 0o666)
          return Effect.succeed(dir)
        }),
        Given('a container mounting the directory')('container', (s) =>
          laneOutcome(
            fromImage('alpine:3.19')
              .withCopyDirectoryToContainer(s.fixture, '/data')
              .withCommand('sleep', '60')
              .start(),
          )),
        When('the guest writes through the mount')('write', (s) =>
          s.container.ok && s.container.value !== undefined
            ? laneOutcome(s.container.value.execCommand('sh', '-c', 'echo mutated > /data/mounted.txt && sync'))
            : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
        Then('the write succeeded and reached the host file — the mount is a view, not a copy')((s) => {
          expect(s.container.ok).toBe(true)
          expect(s.write.ok).toBe(true)
          expect(s.write.value?.exitCode).toBe(0)
          expect(fs.readFileSync(path.join(s.fixture, 'mounted.txt'), 'utf8')).toContain('mutated')
        }),
        When('the host rewrites the file')('hostWrite', (s) =>
          Effect.sync(() => {
            fs.writeFileSync(path.join(s.fixture, 'mounted.txt'), 'from-host\n')
            return undefined
          })),
        When('the guest reads it back')('readBack', (s) =>
          s.container.ok && s.container.value !== undefined
            ? laneOutcome(s.container.value.execCommand('cat', '/data/mounted.txt'))
            : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
        Then('the host write is visible in the guest')((s) => {
          if (s.readBack.ok && s.readBack.value !== undefined) {
            expect(s.readBack.value.stdout).toContain('from-host')
          } else {
            expect(s.readBack.ok).toBe(true)
          }
        }),
      ),
    )

    scenario(
      'ShouldLeaveMsbRootDiskFlagsInertWhenRunningOnDocker',
      Gherkin.Do.pipe(
        When('the backend capabilities are observed')('caps', () =>
          laneOutcome(
            Effect.gen(function*() {
              const runtime = yield* SandboxRuntime
              return runtime.capabilities
            }),
          )),
        When('a tmpfs-root spec starts')('tmpfs', () =>
          laneOutcome(
            fromImage('alpine:3.19').withTmpfsRoot(256).withCommand('sleep', '60').start(),
          )),
        When('an exec writes under the writable root')('tmpfsWrite', (s) =>
          s.tmpfs.ok && s.tmpfs.value !== undefined
            ? laneOutcome(s.tmpfs.value.execCommand('sh', '-c', 'echo tmpfs-write > /root/marker.txt && sync'))
            : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.tmpfs.failureMessage))),
        When('a disk-limited spec starts')(
          'disk',
          () => laneOutcome(fromImage('alpine:3.19').withDiskLimit(1024).withCommand('sleep', '60').start()),
        ),
        When('an exec runs in the disk-limited container')('diskProbe', (s) =>
          s.disk.ok && s.disk.value !== undefined
            ? laneOutcome(s.disk.value.execCommand('true'))
            : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.disk.failureMessage))),
        Then('the flags are inert: docker declares its capability data and boots both specs normally')((s) => {
          expect(s.caps.ok).toBe(true)
          expect(s.caps.value).toEqual(DOCKER_CAPABILITIES)
          expect(s.tmpfs.ok).toBe(true)
          expect(s.tmpfsWrite.ok).toBe(true)
          expect(s.tmpfsWrite.value?.exitCode).toBe(0)
          expect(s.disk.ok).toBe(true)
          expect(s.diskProbe.ok).toBe(true)
          expect(s.diskProbe.value?.exitCode).toBe(0)
        }),
      ),
    )

    scenario(
      'ShouldServeAPublishedPortWhenTheNetworkDisabledFlagIsIgnoredOnDocker',
      Gherkin.Do.pipe(
        When('a network-disabled server starts')('container', () =>
          laneOutcome(
            fromImage('python:3.12-alpine')
              .withCommand('python3', '-m', 'http.server', '8000')
              .withExposedPorts(8000)
              .withNetworkDisabled()
              .withStartupTimeout(30_000)
              .waitingFor(Wait.forHttp('/', { port: 8000 }))
              .start(),
          )),
        When('the mapped port is probed over loopback')('reachable', (s) => {
          const port = s.container.ok && s.container.value !== undefined
            ? s.container.value.getMappedPort(8000)
            : undefined
          return port === undefined ? Effect.succeed(false) : Effect.promise(() => portIsReachable(port))
        }),
        Then('the port is reachable — docker ignores the msb-only egress block')((s) => {
          expect(s.container.ok).toBe(true)
          expect(s.container.value?.getHost()).toBe('127.0.0.1')
          expect(s.reachable).toBe(true)
        }),
      ),
    )
  },
)
