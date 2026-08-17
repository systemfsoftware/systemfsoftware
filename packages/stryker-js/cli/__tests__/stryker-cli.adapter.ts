/**
 * The lane's CLI driver — reconstructs the harness-owned container from the
 * durable by-id handle JSON vitest injected at global setup (F5), replacing
 * the `getContainerRuntimeClient` glue this file used to carry. The handle
 * is fingerprint-validated on reconstruction; exec requests map 1:1 —
 * `{workingDir, env}` from the testcontainers era become `ExecRequest`
 * fields, and the exit code stays a verdict: a missing working directory
 * still surfaces as the exit-127 trap in `ExecResult.exitCode`, never as a
 * thrown error (F3).
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

import { CLI_BIN, strykerContainerId, WORKDIR } from './stryker-cli-env.js'

export interface CliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface ExecOptions {
  readonly cwd?: string
  readonly env?: Record<string, string>
}

export class StrykerCli extends Context.Service<StrykerCli, {
  readonly run: (args: readonly string[], options?: ExecOptions) => Effect.Effect<CliResult>
  readonly sh: (script: string, options?: ExecOptions) => Effect.Effect<CliResult>
}>()(
  '@systemfsoftware/stryker-js-cli/__tests__/stryker-cli.adapter/StrykerCli',
) {}

/** The docker-pinned config the by-id reconstruction resolves under — the same lane posture as the global setup. */
const laneConfig = (): RightsizeConfigService => ({
  backend: 'docker',
  reaper: 'off',
  cacheDir: join(tmpdir(), `stryker-contract-cache-${process.pid}`),
  reuse: false,
  msbPath: undefined,
  msbSkipDownload: true,
})

/** The reconstruction environment: `ContainerHandle.byId` dials the docker socket from the selected backend. */
const selectionLayer = layerAuto({ msbSupported: false }).pipe(
  Layer.provideMerge(Layer.mergeAll(Layer.succeed(RightsizeConfig, laneConfig()), layerRuntimeDiscovery)),
)

export const layerStrykerCli: Layer.Layer<StrykerCli> = Layer.effect(
  StrykerCli,
  Effect.gen(function*() {
    // Reconstructs the harness-owned container from the durable handle JSON
    // vitest injected at global setup — no launch, no discovery ritual here.
    // A reconstruction failure is a harness defect: the lane must die, and
    // the layer's error channel stays `never` for the gherkin seam.
    const ops = yield* ContainerHandle.byId(strykerContainerId()).pipe(
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
      run: (args: readonly string[], options?: ExecOptions) => exec([CLI_BIN, ...args], options),
      sh: (script: string, options?: ExecOptions) => exec(['sh', '-c', script], options),
    }
  }),
)
