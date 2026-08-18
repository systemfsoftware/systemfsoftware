import { Context, Effect, Layer } from 'effect'
import { getContainerRuntimeClient } from 'testcontainers'

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
  '@systemfsoftware/stryker-js-cli/tests/__fixtures__/StrykerCliAdapter/StrykerCli',
) {}

export const layerStrykerCli: Layer.Layer<StrykerCli> = Layer.effect(
  StrykerCli,
  Effect.map(
    Effect.promise(() =>
      getContainerRuntimeClient().then((client) => ({
        client,
        container: client.container.getById(strykerContainerId()),
      }))
    ),
    ({ client, container }) => {
      const exec = (command: readonly string[], options?: ExecOptions) =>
        Effect.map(
          Effect.promise(() =>
            client.container.exec(container, [...command], {
              workingDir: options?.cwd ?? WORKDIR,
              ...(options?.env === undefined ? {} : { env: options.env }),
            })
          ),
          (result) => ({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }),
        )

      return {
        run: (args: readonly string[], options?: ExecOptions) => exec([CLI_BIN, ...args], options),
        sh: (script: string, options?: ExecOptions) => exec(['sh', '-c', script], options),
      }
    },
  ),
)
