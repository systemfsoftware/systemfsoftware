import { Context, Effect, Layer } from 'effect'
import { getContainerRuntimeClient } from 'testcontainers'
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

export class Container extends Context.Tag('@systemfsoftware/arethetypeswrong-cli/container')<
  Container,
  ContainerService
>() {}

export const ContainerLive: Layer.Layer<Container> = Layer.effect(
  Container,
  Effect.promise(async () => {
    const client = await getContainerRuntimeClient()
    const container = client.container.getById(inject('attwContainerId'))
    const exec = (command: readonly string[], options?: ExecOptions) =>
      Effect.promise(() =>
        client.container.exec(container, [...command], {
          workingDir: options?.cwd ?? WORKDIR,
          ...(options?.env === undefined ? {} : { env: options.env }),
        })
      ).pipe(
        Effect.map((result) => ({
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        })),
        Effect.orDie,
      )
    return {
      run: (args, options) => exec([CLI_BIN, ...args], options),
      sh: (script, options) => exec(['sh', '-c', script], options),
    }
  }),
)
