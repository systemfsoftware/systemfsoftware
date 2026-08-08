import { Context, Data, Effect, Layer } from 'effect'
import { GenericContainer, getContainerRuntimeClient, type StartedTestContainer } from 'testcontainers'

export const SUPPORTED_NODE_IMAGE = 'node:22-alpine'

export class ContainerRuntimeUnavailable extends Data.TaggedError('ContainerRuntimeUnavailable')<{
  readonly dockerHost: string
  readonly cause: unknown
}> {
  override get message(): string {
    return [
      'stryker-js contract lane: no container runtime is reachable.',
      '',
      `  DOCKER_HOST=${this.dockerHost}`,
      '',
      'This lane runs the real stryker binary as a real process in a container.',
      'It has no in-process fallback and it never skips: a lane that reported',
      'zero tests and passed would certify a contract nothing checked.',
      '',
      'Start a runtime, then re-run:',
      '  docker:  systemctl --user start docker',
      '  podman:  systemctl --user start podman.socket',
      '           export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock',
    ].join('\n')
  }
}

export class ContainerStartFailed extends Data.TaggedError('ContainerStartFailed')<{
  readonly image: string
  readonly cause: unknown
}> {
  override get message(): string {
    return [
      `stryker-js contract lane: the runtime is reachable but \`${this.image}\` did not start.`,
      'Usually an unpullable tag or a registry this host cannot reach.',
    ].join('\n')
  }
}

export class ContractContainer extends Context.Tag('ContractContainer')<
  ContractContainer,
  StartedTestContainer
>() {}

const runtimeReachable = Effect.tryPromise({
  try: () => getContainerRuntimeClient(),
  catch: (cause) =>
    new ContainerRuntimeUnavailable({
      dockerHost: process.env['DOCKER_HOST'] ?? '<unset>',
      cause,
    }),
})

const startContainer = (image: string) =>
  Effect.tryPromise({
    try: () => new GenericContainer(image).withCommand(['sleep', 'infinity']).start(),
    catch: (cause) => new ContainerStartFailed({ image, cause }),
  })

/**
 * The container is a scoped resource. Release runs uninterruptibly on every
 * exit, which is what keeps this lane from leaking the containers it is itself
 * stressing with signals, closed pipes, and deliberate hangs.
 */
export const layerContainer = (
  image: string,
): Layer.Layer<ContractContainer, ContainerRuntimeUnavailable | ContainerStartFailed> =>
  Layer.scoped(
    ContractContainer,
    Effect.acquireRelease(
      Effect.andThen(runtimeReachable, startContainer(image)),
      (container) => Effect.ignore(Effect.tryPromise(() => container.stop())),
    ),
  )

export const exec = (
  command: ReadonlyArray<string>,
): Effect.Effect<
  { readonly exitCode: number; readonly stdout: string; readonly stderr: string; readonly output: string },
  never,
  ContractContainer
> =>
  Effect.flatMap(
    ContractContainer,
    (container) => Effect.promise(() => container.exec([...command])),
  )
