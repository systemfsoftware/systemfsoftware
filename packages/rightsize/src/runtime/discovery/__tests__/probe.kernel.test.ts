/**
 * Probe-kernel decision tests (R8/KTD4): candidate ordering, the explicit
 * `DOCKER_HOST` authority, and the first-live decision over recorded
 * verdicts — liveness by connect, never by stat.
 */
import { describe, expect, it } from 'vitest'

import {
  classifyDockerHost,
  DEFAULT_DOCKER_SOCKET,
  orderedSocketCandidates,
  SYSTEM_PODMAN_SOCKET,
} from '../probe.kernel.js'

describe('classifyDockerHost', () => {
  it('Should_TreatUnsetAndEmptyAsUnset_When_NoValue', () => {
    expect(classifyDockerHost(undefined)).toEqual({ kind: 'unset' })
    expect(classifyDockerHost('')).toEqual({ kind: 'unset' })
  })

  it('Should_ExtractSocketPath_When_UnixOrAbsolute', () => {
    expect(classifyDockerHost('unix:///run/podman/podman.sock')).toEqual({
      kind: 'unix',
      socketPath: '/run/podman/podman.sock',
    })
    expect(classifyDockerHost('/var/run/docker.sock')).toEqual({ kind: 'unix', socketPath: '/var/run/docker.sock' })
  })

  it('Should_Refuse_When_NonUnixScheme', () => {
    expect(classifyDockerHost('tcp://localhost:2375')).toEqual({ kind: 'refused', value: 'tcp://localhost:2375' })
    expect(classifyDockerHost('http://daemon:2375')).toEqual({ kind: 'refused', value: 'http://daemon:2375' })
  })
})

describe('orderedSocketCandidates', () => {
  it('Should_BeAuthoritative_When_ExplicitHostSet', () => {
    const candidates = orderedSocketCandidates({
      dockerHost: 'unix:///var/run/docker.sock',
      xdgRuntimeDir: '/run/user/1000',
      uid: 1000,
    })
    expect(candidates).toEqual([{ id: 'docker-host', socketPath: '/var/run/docker.sock' }])
    const absolute = orderedSocketCandidates({ dockerHost: '/custom/docker.sock' })
    expect(absolute).toEqual([{ id: 'docker-host', socketPath: '/custom/docker.sock' }])
  })

  it('Should_WalkDockerThenTwoPodmanSockets_When_Unset', () => {
    const candidates = orderedSocketCandidates({ uid: 1000, xdgRuntimeDir: '/run/user/1000' })
    expect(candidates.map((candidate) => candidate.id)).toEqual(['docker.sock', 'xdg-podman', 'podman-system'])
    expect(candidates[0]?.socketPath).toBe(DEFAULT_DOCKER_SOCKET)
    expect(candidates[1]?.socketPath).toBe('/run/user/1000/podman/podman.sock')
    expect(candidates[2]?.socketPath).toBe(SYSTEM_PODMAN_SOCKET)
  })

  it('Should_FallbackToRunUserForRootlessPodman_When_XdgUnset', () => {
    const candidates = orderedSocketCandidates({ uid: 42 })
    expect(candidates.map((candidate) => candidate.id)).toEqual(['docker.sock', 'xdg-podman', 'podman-system'])
    expect(candidates[1]?.socketPath).toBe('/run/user/42/podman/podman.sock')
  })

  it('Should_OmitRootlessCandidate_When_NeitherXdgNorUidKnown', () => {
    const candidates = orderedSocketCandidates({})
    expect(candidates.map((candidate) => candidate.id)).toEqual(['docker.sock', 'podman-system'])
  })
})

describe('firstLiveCandidate (the probe decision)', () => {
  it('Should_FallThroughDeadDockerSocketToLivePodman_When_StaleFilePresent', () => {
    // The stale-file trap: docker.sock exists but nothing listens on it
    // (live: false); the walk must fall through to the live podman socket.
    const probes = [
      { id: 'docker.sock', socketPath: '/var/run/docker.sock', live: false },
      { id: 'xdg-podman', socketPath: '/run/user/1000/podman/podman.sock', live: true },
      { id: 'podman-system', socketPath: '/run/podman/podman.sock', live: false },
    ]
    const winner = probes.find((probe) => probe.live)
    expect(winner).toEqual(probes[1])
  })

  it('Should_ReportNothingLive_When_EveryProbeDead', () => {
    const probes = [
      { id: 'docker.sock', socketPath: '/var/run/docker.sock', live: false },
      { id: 'podman-system', socketPath: '/run/podman/podman.sock', live: false },
    ]
    expect(probes.find((probe) => probe.live)).toBeUndefined()
  })

  it('Should_PickHighestPriority_When_MultipleLive', () => {
    const probes = [
      { id: 'docker.sock', socketPath: '/var/run/docker.sock', live: true },
      { id: 'podman-system', socketPath: '/run/podman/podman.sock', live: true },
    ]
    expect(probes.find((probe) => probe.live)).toEqual(probes[0])
  })
})
