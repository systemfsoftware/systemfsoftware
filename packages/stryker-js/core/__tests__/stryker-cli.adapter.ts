import { Context, Effect, Layer } from 'effect'
import { getContainerRuntimeClient } from 'testcontainers'
import { inject } from 'vitest'

const WORKDIR = '/work'

export const CLI_BIN = `${WORKDIR}/node_modules/.bin/stryker`

export const fixtureDir = (name: string): string => `${WORKDIR}/fixtures/${name}`

export interface CliResult {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export interface ExecOptions {
  readonly cwd?: string
  readonly env?: Record<string, string>
}

export class StrykerCli extends Context.Tag('StrykerCli')<StrykerCli, {
  readonly run: (args: ReadonlyArray<string>, options?: ExecOptions) => Effect.Effect<CliResult>
  readonly sh: (script: string, options?: ExecOptions) => Effect.Effect<CliResult>
}>() {}

export const layerStrykerCli: Layer.Layer<StrykerCli> = Layer.effect(
  StrykerCli,
  Effect.map(
    Effect.promise(async () => {
      const client = await getContainerRuntimeClient()
      return { client, container: client.container.getById(inject('strykerContainerId')) }
    }),
    ({ client, container }) => {
      const exec = (command: ReadonlyArray<string>, options?: ExecOptions) =>
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
        run: (args: ReadonlyArray<string>, options?: ExecOptions) => exec([CLI_BIN, ...args], options),
        sh: (script: string, options?: ExecOptions) => exec(['sh', '-c', script], options),
      }
    },
  ),
)
