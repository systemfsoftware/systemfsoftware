/**
 * Copy contract (R12), ported from upstream `test/it/contract.test.ts`:
 * start-time copies through the builder, and runtime copies against a
 * running container — host file in (guest parent auto-created), host
 * directory in recursively (`cp -r` destination semantics: contents land
 * at the destination, not nested under it), guest file out (host parent
 * auto-created), and guest directory out recursively. Every copy's content
 * is proven through an exec `cat` round-trip (or a host read-back) — real
 * daemon bytes, through the real docker backend (RS-LANE).
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import { fromImage, toRunningContainer } from '../../src/generic-container.js'
import { launchContainer } from '../../src/lifecycle/launch.js'
import type { ExecResult } from '../../src/model/container-spec.js'
import { laneOutcome, outcomeFailure } from './helpers.js'

const Feature = makeFeature({ it, layer })

/** A temp host fixture: its root dir plus absolute paths under it. */
interface HostFixture {
  readonly dir: string
}

const makeHostDir = (prefix: string): HostFixture => ({ dir: fs.mkdtempSync(path.join(os.tmpdir(), prefix)) })

/** Best-effort host fixture cleanup — a lane temp dir is never a blocker. */
const cleanupHost = (fixture: HostFixture | undefined): void => {
  if (fixture !== undefined) {
    fs.rmSync(fixture.dir, { recursive: true, force: true })
  }
}

Feature('the copy contract runs real containers through the docker backend').liveClock().body(({ scenario }) => {
  scenario(
    'ShouldRoundTripStartTimeCopiesWhenHostFilesAndDirectoriesMountBeforeBoot',
    Gherkin.Do.pipe(
      Given('a temp host file and a temp host directory')('fixtures', () => {
        const fileFixture = makeHostDir('rightsize-start-copy-file-')
        fs.writeFileSync(path.join(fileFixture.dir, 'bundled.txt'), 'from-host-file\n')
        const dirFixture = makeHostDir('rightsize-start-copy-dir-')
        fs.mkdirSync(path.join(dirFixture.dir, 'nested'))
        fs.writeFileSync(path.join(dirFixture.dir, 'nested', 'nested.txt'), 'from-host-directory\n')
        return Effect.succeed({ fileFixture, dirFixture })
      }),
      Given('a container mounting both before boot')('container', (s) =>
        laneOutcome(
          fromImage('alpine:3.19')
            .withCopyFileToContainer(path.join(s.fixtures.fileFixture.dir, 'bundled.txt'), '/data/bundled.txt')
            .withCopyDirectoryToContainer(s.fixtures.dirFixture.dir, '/other')
            .withCommand('sleep', '60')
            .start(),
        )),
      When('it cats the mounted file')('fileCat', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(s.container.value.execCommand('cat', '/data/bundled.txt'))
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
      When('it cats the mounted directory member')('dirCat', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(s.container.value.execCommand('cat', '/other/nested/nested.txt'))
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
      Then('both contents round-tripped through exec')((s) => {
        expect(s.container.ok).toBe(true)
        expect(s.fileCat.ok).toBe(true)
        expect(s.fileCat.value?.stdout.trim()).toBe('from-host-file')
        expect(s.dirCat.ok).toBe(true)
        expect(s.dirCat.value?.stdout.trim()).toBe('from-host-directory')
      }),
      When('fixtures are removed')('cleanup', (s) =>
        Effect.sync(() => {
          cleanupHost(s.fixtures.fileFixture)
          cleanupHost(s.fixtures.dirFixture)
          return undefined
        })),
    ),
  )

  scenario(
    'ShouldCopyAHostFileInWhenTheRuntimeCopyCreatesTheGuestParent',
    Gherkin.Do.pipe(
      Given('a temp host file')('fixture', () => {
        const hostDir = makeHostDir('rightsize-runtime-copy-in-')
        fs.writeFileSync(path.join(hostDir.dir, 'runtime.txt'), 'runtime-copy-content')
        return Effect.succeed(hostDir)
      }),
      Given('a running container launched through the executor')('container', () =>
        laneOutcome(
          Effect.map(
            launchContainer(fromImage('alpine:3.19').withCommand('sleep', '60').spec),
            toRunningContainer,
          ),
        )),
      When('a runtime copy places it under a not-yet-existing guest parent')(
        'copied',
        (s) =>
          s.container.ok && s.container.value !== undefined
            ? laneOutcome(
              s.container.value.copyFileToContainer(
                path.join(s.fixture.dir, 'runtime.txt'),
                '/data/nested/runtime.txt',
              ),
            )
            : Effect.succeed(outcomeFailure<void>('launch-failed', s.container.failureMessage)),
      ),
      When('an exec cats the copied file')('read', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(s.container.value.execCommand('cat', '/data/nested/runtime.txt'))
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
      Then('the exact content round-tripped, proving the parent mkdir pre-step ran')((s) => {
        expect(s.copied.ok).toBe(true)
        expect(s.read.ok).toBe(true)
        expect(s.read.value?.exitCode).toBe(0)
        expect(s.read.value?.stdout.trim()).toBe('runtime-copy-content')
      }),
      When('fixtures are removed')('cleanup', (s) =>
        Effect.sync(() => {
          cleanupHost(s.fixture)
          return undefined
        })),
    ),
  )

  scenario(
    'ShouldCopyAHostDirectoryInRecursively_WhenTheDestinationGuestDirIsNew',
    Gherkin.Do.pipe(
      Given('a temp host directory with a nested file')('fixture', () => {
        const hostDir = makeHostDir('rightsize-runtime-copy-dir-')
        fs.mkdirSync(path.join(hostDir.dir, 'sub'))
        fs.writeFileSync(path.join(hostDir.dir, 'sub', 'nested.txt'), 'nested-content')
        return Effect.succeed(hostDir)
      }),
      Given('a running container')(
        'container',
        () => laneOutcome(fromImage('alpine:3.19').withCommand('sleep', '60').start()),
      ),
      When('the host directory is copied in')('copied', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(s.container.value.copyFileToContainer(s.fixture.dir, '/data/copied-dir'))
          : Effect.succeed(outcomeFailure<void>('launch-failed', s.container.failureMessage))),
      When('an exec cats the nested destination member')(
        'read',
        (s) =>
          s.container.ok && s.container.value !== undefined
            ? laneOutcome(s.container.value.execCommand('cat', '/data/copied-dir/sub/nested.txt'))
            : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage)),
      ),
      Then('cp -r destination semantics: contents at the destination, not nested under it')((s) => {
        expect(s.copied.ok).toBe(true)
        expect(s.read.ok).toBe(true)
        expect(s.read.value?.stdout.trim()).toBe('nested-content')
      }),
      When('fixtures are removed')('cleanup', (s) =>
        Effect.sync(() => {
          cleanupHost(s.fixture)
          return undefined
        })),
    ),
  )

  scenario(
    'ShouldCopyAGuestFileOut_WhenTheHostDestinationParentDoesNotExist',
    Gherkin.Do.pipe(
      Given('a running container')(
        'container',
        () => laneOutcome(fromImage('alpine:3.19').withCommand('sleep', '60').start()),
      ),
      When('a guest file is written')('write', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(
            s.container.value.execCommand('sh', '-c', 'mkdir -p /out && echo guest-written-content > /out/result.txt'),
          )
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
      When('the guest file is copied out to a not-yet-existing host parent')('copied', (s) => {
        const hostDir = makeHostDir('rightsize-runtime-copy-out-')
        const hostDest = path.join(hostDir.dir, 'not-yet-existing', 'result.txt')
        return s.container.ok && s.container.value !== undefined
          ? Effect.map(
            laneOutcome(s.container.value.copyFileFromContainer('/out/result.txt', hostDest)),
            (outcome) => ({ outcome, fixture: hostDir, hostDest }),
          )
          : Effect.succeed({
            outcome: outcomeFailure<void>('launch-failed', s.container.failureMessage),
            fixture: hostDir,
            hostDest,
          })
      }),
      Then('the host file exists at the destination and matches')((s) => {
        expect(s.copied.outcome.ok).toBe(true)
        const content = fs.readFileSync(s.copied.hostDest, 'utf8')
        expect(content.trim()).toBe('guest-written-content')
      }),
      When('fixtures are removed')('cleanup', (s) =>
        Effect.sync(() => {
          cleanupHost(s.copied.fixture)
          return undefined
        })),
    ),
  )

  scenario(
    'ShouldCopyAGuestDirectoryOutRecursively_WhenTheHostDestinationIsNew',
    Gherkin.Do.pipe(
      Given('a running container')(
        'container',
        () => laneOutcome(fromImage('alpine:3.19').withCommand('sleep', '60').start()),
      ),
      When('a guest directory tree is written')('write', (s) =>
        s.container.ok && s.container.value !== undefined
          ? laneOutcome(
            s.container.value.execCommand(
              'sh',
              '-c',
              'mkdir -p /outdir/sub && echo nested-guest-content > /outdir/sub/nested.txt',
            ),
          )
          : Effect.succeed(outcomeFailure<ExecResult>('launch-failed', s.container.failureMessage))),
      When('the guest directory is copied out')('copied', (s) => {
        const fixture = makeHostDir('rightsize-runtime-copy-outdir-')
        const hostDest = path.join(fixture.dir, 'copied-out-dir')
        return s.container.ok && s.container.value !== undefined
          ? Effect.map(
            laneOutcome(s.container.value.copyFileFromContainer('/outdir', hostDest)),
            (outcome) => ({ outcome, fixture, hostDest }),
          )
          : Effect.succeed({
            outcome: outcomeFailure<void>('launch-failed', s.container.failureMessage),
            fixture,
            hostDest,
          })
      }),
      Then('The nested host member matches the guest content')((s) => {
        expect(s.copied.outcome.ok).toBe(true)
        const content = fs.readFileSync(path.join(s.copied.hostDest, 'sub', 'nested.txt'), 'utf8')
        expect(content.trim()).toBe('nested-guest-content')
      }),
      When('fixtures and the container are removed')('cleanup', (s) =>
        Effect.sync(() => {
          cleanupHost(s.copied.fixture)
          return undefined
        })),
    ),
  )
})
