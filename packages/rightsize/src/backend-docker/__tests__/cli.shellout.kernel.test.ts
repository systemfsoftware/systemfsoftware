/**
 * `cli.shellout` tests: pure argv vectors for cp/save/load, the runner's
 * nonzero-exit-as-data + stderr-carrying contract against a fake `docker`
 * executable on PATH (no real daemon), the reaper kill-command prefixes,
 * and the blocking cleanup primitive's best-effort no-throw shape.
 * Promise-chain test callbacks (no `async`), per the package's effect
 * tsconfig profile.
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BackendError } from '../../model/errors.js'
import { DOCKER_REAPER_KILL_COMMAND, DockerCli, registerDockerCleanupSync, runDockerCli } from '../cli.shellout.js'

describe('DockerCli argv vectors', () => {
  it('Should_BuildHostToGuestCopyIn_When_TheGuestPathIsAppended', () => {
    expect(DockerCli.copyIn('/host/a', 'abc123', '/tmp/b')).toEqual(['cp', '/host/a', 'abc123:/tmp/b'])
  })

  it('Should_BuildGuestToHostCopyOut_When_TheHostPathIsTheDestination', () => {
    expect(DockerCli.copyOut('abc123', '/tmp/b', '/host/a')).toEqual(['cp', 'abc123:/tmp/b', '/host/a'])
  })

  it('Should_BuildSaveWithTheOutputFlag_When_DestinatingAnArchive', () => {
    expect(DockerCli.save('/tmp/c.tar', 'rightsize/checkpoint:abc')).toEqual([
      'save',
      '-o',
      '/tmp/c.tar',
      'rightsize/checkpoint:abc',
    ])
  })

  it('Should_BuildLoadWithTheInputFlag_When_MaterializingAnArchive', () => {
    expect(DockerCli.load('/tmp/c.tar')).toEqual(['load', '-i', '/tmp/c.tar'])
  })
})

describe('DOCKER_REAPER_KILL_COMMAND', () => {
  it('Should_NameTheKillPrefixes_When_TheReaperNeedsDockerCli', () => {
    expect(DOCKER_REAPER_KILL_COMMAND).toEqual({
      stop: [],
      remove: ['docker', 'rm', '-f'],
      removeNetwork: ['docker', 'network', 'rm'],
    })
  })
})

/** Installs a fake `docker` binary that exits with `code` writing `stderr`, returning the cleanup fn. */
const installFakeDocker = (exitCode: number, stderr: string): () => void => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rzd-fake-bin-'))
  const bin = path.join(dir, 'docker')
  fs.writeFileSync(bin, `#!/bin/sh\necho -n '${stderr}' >&2\nexit ${exitCode}\n`, { mode: 0o755 })
  const previous = process.env['PATH'] ?? ''
  process.env['PATH'] = `${dir}:${previous}`
  return () => {
    fs.rmSync(dir, { recursive: true, force: true })
    process.env['PATH'] = previous
  }
}

describe('runDockerCli', () => {
  it('Should_ReturnTheExitCodeWithCapturedStderr_When_TheToolFails', () => {
    const cleanup = installFakeDocker(3, 'boom')
    return runDockerCli(DockerCli.copyIn('/host/a', 'c1', '/tmp/b'), 5_000).then((result) => {
      expect(result.stderr).toBe('boom')
      expect(result.exitCode).toBe(3)
    }).finally(cleanup)
  })

  it('Should_RejectWithBackendError_When_TheBinaryCannotBeSpawned', () => {
    const previous = process.env['PATH']
    process.env['PATH'] = '/nonexistent-dir'
    return runDockerCli(['cp', 'a', 'b'], 5_000).then(
      () => Promise.reject(new Error('expected a spawn failure')),
      (error: unknown) => {
        expect(error).toBeInstanceOf(BackendError)
      },
    ).finally(() => {
      process.env['PATH'] = previous
    })
  })
})

describe('registerDockerCleanupSync', () => {
  it('Should_ReturnABlockingNoThrowCleanup_When_TheSocketIsUnreachable', () => {
    const cleanup = registerDockerCleanupSync('/nonexistent/docker.sock')
    expect(typeof cleanup).toBe('function')
    expect(() => cleanup('abc123')).not.toThrow()
  })
})
