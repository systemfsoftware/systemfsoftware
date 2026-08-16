/**
 * Selection workflow tests — recorded probe results drive the decision
 * (R8), plus a composition test through `layerAuto` with recorded-discovery
 * and recorded-config doubles (the no-io-boundary-tests doctrine: the socket
 * adapter itself is exercised by the parity lane, not unit tests).
 */
import { Effect, Option, Result } from 'effect'
import { describe, expect, it } from 'vitest'

import { RightsizeConfig, type RightsizeConfigService } from '../config.js'
import { RuntimeDiscovery } from '../discovery/discovery.adapter.js'
import type { SocketProbeVerdict } from '../discovery/probe.kernel.js'
import {
  BackendUnreachableError,
  decideSelection,
  layerAuto,
  Selection,
  type SelectionCommand,
  SelectionDocker,
  SelectionMsb,
} from '../selection.workflow.js'

const liveProbe = (id: string, socketPath: string): SocketProbeVerdict => ({ id, socketPath, live: true })
const deadProbe = (id: string, socketPath: string): SocketProbeVerdict => ({ id, socketPath, live: false })

const dockerCommand = (probes: ReadonlyArray<SocketProbeVerdict>): SelectionCommand => ({
  _tag: 'PreferDocker',
  probes: probes.map((probe) => ({ id: probe.id, socketPath: probe.socketPath, live: probe.live })),
  first: probes.find((probe) => probe.live) ?? undefined,
})

const autoCommand = (probes: ReadonlyArray<SocketProbeVerdict>, msbSupported: boolean): SelectionCommand => ({
  _tag: 'PreferAuto',
  probes: probes.map((probe) => ({ id: probe.id, socketPath: probe.socketPath, live: probe.live })),
  first: probes.find((probe) => probe.live) ?? undefined,
  msbSupported,
})

describe('decideSelection (recorded probe results)', () => {
  it('Should_SelectMsb_When_PreferenceIsMsb', () => {
    const decision = decideSelection({ _tag: 'PreferMsb' })
    expect(Result.isSuccess(decision)).toBe(true)
    const selected = Result.getOrThrow(decision)
    expect(selected).toBeInstanceOf(SelectionMsb)
  })

  it('Should_SelectDockerAtLiveSocket_When_ForcedDockerHasLiveProbe', () => {
    const decision = decideSelection(
      dockerCommand([
        deadProbe('docker.sock', '/var/run/docker.sock'),
        liveProbe('xdg-podman', '/run/user/1000/podman/podman.sock'),
      ]),
    )
    expect(Result.isSuccess(decision)).toBe(true)
    const selected = Result.getOrThrow(decision)
    expect(selected).toBeInstanceOf(SelectionDocker)
    expect(selected).toMatchObject({ _tag: 'Docker', socketPath: '/run/user/1000/podman/podman.sock' })
  })

  it('Should_FailNamingEveryProbe_When_ForcedDockerUnreachable', () => {
    const decision = decideSelection(dockerCommand([deadProbe('docker.sock', '/var/run/docker.sock')]))
    expect(Result.isFailure(decision)).toBe(true)
    const failureOption = Result.getFailure(decision)
    expect(Option.isSome(failureOption)).toBe(true)
    const failure = Option.getOrThrow(failureOption)
    expect(failure).toBeInstanceOf(BackendUnreachableError)
    expect(failure.requested).toBe('docker')
    expect(failure.probes).toEqual([{ id: 'docker.sock', socketPath: '/var/run/docker.sock', live: false }])
  })

  it('Should_PreferMsb_When_AutoAndMsbSupported', () => {
    const decision = decideSelection(autoCommand([liveProbe('docker.sock', '/var/run/docker.sock')], true))
    expect(Result.isSuccess(decision)).toBe(true)
    expect(Result.getOrThrow(decision)).toBeInstanceOf(SelectionMsb)
  })

  it('Should_FallToHighestPriorityLiveProbe_When_AutoAndNoMsb', () => {
    const decision = decideSelection(
      autoCommand(
        [
          deadProbe('docker.sock', '/var/run/docker.sock'),
          liveProbe('xdg-podman', '/run/user/1000/podman/podman.sock'),
          liveProbe('podman-system', '/run/podman/podman.sock'),
        ],
        false,
      ),
    )
    expect(Result.isSuccess(decision)).toBe(true)
    const selected = Result.getOrThrow(decision)
    expect(selected).toBeInstanceOf(SelectionDocker)
    expect(selected).toMatchObject({ _tag: 'Docker', socketPath: '/run/user/1000/podman/podman.sock' })
  })

  it('Should_ListEveryProbe_When_AutoUnreachable', () => {
    const decision = decideSelection(
      autoCommand(
        [deadProbe('docker.sock', '/var/run/docker.sock'), deadProbe('podman-system', '/run/podman/podman.sock')],
        false,
      ),
    )
    expect(Result.isFailure(decision)).toBe(true)
    const failure = Option.getOrThrow(Result.getFailure(decision))
    expect(failure.requested).toBe('auto')
    expect(failure.probes.map((probe) => probe.id)).toEqual(['docker.sock', 'podman-system'])
  })
})

describe('layerAuto composition (recorded discovery + config doubles)', () => {
  const configValue: RightsizeConfigService = {
    backend: 'auto',
    reaper: 'on',
    cacheDir: undefined,
    reuse: false,
    msbPath: undefined,
    msbSkipDownload: false,
  }

  const readSelection = (probes: ReadonlyArray<SocketProbeVerdict>) => {
    const program = Effect.map(Selection, (selection) => selection)
    const withSelectionLayer = Effect.provide(program, layerAuto())
    const withDiscovery = Effect.provideService(RuntimeDiscovery, { probe: () => Effect.succeed(probes) })(
      withSelectionLayer,
    )
    return Effect.provideService(RightsizeConfig, configValue)(withDiscovery)
  }

  it('Should_YieldDockerSelection_When_LiveDockerSocketAnswers', () => {
    const program = readSelection([liveProbe('docker.sock', '/var/run/docker.sock')])
    return expect(Effect.runPromise(program)).resolves.toMatchObject({
      backend: 'docker',
      dockerSocketPath: '/var/run/docker.sock',
    })
  })

  it('Should_FailUnreachable_When_NothingAnswers', () => {
    const program = readSelection([
      deadProbe('docker.sock', '/var/run/docker.sock'),
      deadProbe('podman-system', '/run/podman/podman.sock'),
    ])
    return expect(Effect.runPromise(program)).rejects.toBeInstanceOf(BackendUnreachableError)
  })
})
