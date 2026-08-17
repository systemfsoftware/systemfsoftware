/**
 * The lane's CLI driver — reconstructs the harness-owned container from the
 * durable by-id handle JSON vitest injected at global setup (F5), replacing
 * the `getContainerRuntimeClient` glue this file used to carry. The handle
 * is fingerprint-validated on reconstruction; exec requests map 1:1 —
 * `{workingDir, env}` from the testcontainers era become `ExecRequest`
 * fields, and the exit code stays a verdict: a missing working directory
 * still surfaces as the exit-127 trap in `ExecResult.exitCode`, never a
 * thrown error (F3). The stub-registry readiness probe and the
 * `cat /tmp/stub.log` diagnostics ride the same surface.
 *
 * Failures to reconstruct or to exec are the lane's own defects: the
 * gherkin feature's `.withLayer` seam constrains this layer's error channel
 * to `never`, and every failure mode here means the harness itself is
 * broken — the lane must red, not skip.
 */
import {
  ContainerHandle,
  layerAuto,
  layerRuntimeDiscovery,
  RightsizeConfig,
  type RightsizeConfigService,
} from '@systemfsoftware/rightsize'
import { Context, Effect, Layer } from 'effect'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inject } from 'vitest'

export const WORKDIR = '/work'

export const CLI_BIN = `${WORKDIR}/node_modules/.bin/attw`

export const fixtureDir = (_name: string): string => `${WORKDIR}/fixtures`

export interface CliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface ExecOptions {
  readonly cwd?: string
  readonly env?: Record<string, string>
}

export interface ContainerService {
  readonly run: (args: readonly string[], options?: ExecOptions) => Effect.Effect<CliResult>
  readonly sh: (script: string, options?: ExecOptions) => Effect.Effect<CliResult>
}

export class Container extends Context.Service<Container, ContainerService>()(
  '@systemfsoftware/arethetypeswrong-cli/container',
) {}

/** The docker-pinned config the by-id reconstruction resolves under — the same lane posture as the global setup. */
const laneConfig = (): RightsizeConfigService => ({
  backend: 'docker',
  reaper: 'off',
  cacheDir: join(tmpdir(), `attw-contract-cache-${process.pid}`),
  reuse: false,
  msbPath: undefined,
  msbSkipDownload: true,
})

/** The reconstruction environment: `ContainerHandle.byId` dials the docker socket from the selected backend. */
const selectionLayer = layerAuto({ msbSupported: false }).pipe(
  Layer.provideMerge(Layer.mergeAll(Layer.succeed(RightsizeConfig, laneConfig()), layerRuntimeDiscovery)),
)

export const ContainerLive: Layer.Layer<Container> = Layer.effect(
  Container,
  Effect.gen(function*() {
    // Reconstructs the harness-owned container from the durable handle JSON
    // vitest injected at global setup — no launch, no discovery ritual here.
    // A reconstruction failure is a harness defect: the lane must die, and
    // the layer's error channel stays `never` for the gherkin seam.
    const ops = yield* ContainerHandle.byId(inject('attwContainerId')).pipe(
      Effect.provide(selectionLayer.pipe(Layer.orDie)),
      Effect.orDie,
    )

    const exec = (command: readonly string[], options?: ExecOptions) =>
      Effect.orDie(
        Effect.map(
          ops.exec({
            command: [...command],
            workingDir: options?.cwd ?? WORKDIR,
            env: Object.entries(options?.env ?? {}),
          }),
          (result) => ({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }),
        ),
      )

    return {
      run: (args, options) => exec([CLI_BIN, ...args], options),
      sh: (script, options) => exec(['sh', '-c', script], options),
    }
  }),
)
