import { NodeServices, NodeSocket } from '@effect/platform-node'
import { ManagedRuntime } from 'effect'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import * as ChildProcess from 'effect/unstable/process/ChildProcess'
import * as ChildProcessSpawner from 'effect/unstable/process/ChildProcessSpawner'
import { GenericContainer, getContainerRuntimeClient, type StartedTestContainer } from 'testcontainers'
import type { TestProject } from 'vitest/node'

const NODE_IMAGE = 'node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32'
const WORKSPACE_PACKAGES = [
  '@systemfsoftware/stryker-js-cli',
  '@systemfsoftware/stryker-js',
  '@systemfsoftware/stryker-js-platform-node',
  '@systemfsoftware/stryker-js-html-reporter',
  '@systemfsoftware/stryker-js-instrumenter',
  '@systemfsoftware/effect-cell-types',
] as const
const WORKDIR = '/work'
const TARBALLS_IN_CONTAINER = '/opt/tarballs'
const WORKSPACE_MANIFEST = JSON.stringify({
  name: 'stryker-contract-workspace',
  private: true,
})

/** One runtime for the whole contract lane, created once at module load. */
const stopContractResources = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const started = container
  if (started !== undefined) {
    yield* Effect.tryPromise({
      try: () => started.stop(),
      catch: () => undefined,
    }).pipe(Effect.orElseSucceed(() => undefined))
  }
  const packDir = tarballDir
  if (packDir !== undefined) {
    yield* fs.remove(packDir, { recursive: true }).pipe(
      Effect.catchCause(() => Effect.succeed(undefined)),
      Effect.catchDefect(() => Effect.succeed(undefined)),
    )
  }
})

const runtime = ManagedRuntime.make(
  Layer.merge(
    NodeServices.layer,
    Layer.effectDiscard(
      Effect.gen(function*() {
        yield* Effect.addFinalizer(() => stopContractResources)
      }),
    ).pipe(Layer.provide(NodeServices.layer)),
  ),
)

let container: StartedTestContainer | undefined
let tarballDir: string | undefined

const DOCKER_SOCKET = '/var/run/docker.sock'

const podmanSockets = (path: Path.Path): readonly string[] => {
  const uid = process.getuid?.()
  let runtimeDir: string | undefined = process.env['XDG_RUNTIME_DIR']
  if (runtimeDir === undefined) {
    if (uid !== undefined) {
      runtimeDir = `/run/user/${uid}`
    }
  }
  let rootless: readonly string[]
  if (runtimeDir === undefined) {
    rootless = []
  } else {
    rootless = [path.join(runtimeDir, 'podman', 'podman.sock')]
  }
  return [...rootless, '/run/podman/podman.sock']
}

const dockerHost = (): string | undefined => process.env['DOCKER_HOST']
const setDockerHost = (host: string): void => {
  process.env['DOCKER_HOST'] = host
}

const reachable = (socketPath: string): Effect.Effect<boolean, never, never> =>
  Effect.scoped(NodeSocket.makeNet({ path: socketPath, openTimeout: '1 seconds' })).pipe(
    Effect.as(true),
    Effect.catchCause(() => Effect.succeed(false)),
    Effect.catchDefect(() => Effect.succeed(false)),
  )

const selectContainerRuntime = Effect.gen(function*() {
  if (dockerHost() !== undefined) return
  if (yield* reachable(DOCKER_SOCKET)) return
  const path = yield* Path.Path
  for (const candidate of podmanSockets(path)) {
    if (yield* reachable(candidate)) {
      setDockerHost(`unix://${candidate}`)
      return
    }
  }
})

export function setup(project: TestProject): Promise<void> {
  return runtime.runPromise(
    Effect.gen(function*() {
      const path = yield* Path.Path
      const fs = yield* FileSystem.FileSystem
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const cliDir = yield* path.fromFileUrl(new URL('./', import.meta.url))
      const fixturesDir = yield* path.fromFileUrl(new URL('./tests/__fixtures__/fixtures', import.meta.url))
      const distEntry = path.join(cliDir, 'dist', 'main.mjs')
      const distPresent = yield* fs.exists(distEntry).pipe(
        Effect.catchCause(() => Effect.succeed(false)),
        Effect.catchDefect(() => Effect.succeed(false)),
      )
      if (!distPresent) {
        return yield* Effect.die(
          new Error(`the CLI contract lane needs a built package: ${distEntry} is missing - run \`pnpm build\` first`),
        )
      }

      yield* selectContainerRuntime
      yield* Effect.tryPromise({
        try: () => getContainerRuntimeClient(),
        catch: (cause: unknown) =>
          new Error(
            `the CLI contract lane needs a container runtime, and DOCKER_HOST=${
              process.env['DOCKER_HOST'] ?? '<unset>'
            } is not reachable - tried ${[DOCKER_SOCKET, ...podmanSockets(path)].join(', ')}`,
            { cause },
          ),
      }).pipe(Effect.orDie)

      const packDir = yield* fs.makeTempDirectory({ prefix: 'stryker-contract-' })
      tarballDir = packDir
      for (const workspacePackage of WORKSPACE_PACKAGES) {
        const command = ChildProcess.make('pnpm', [
          '--filter',
          workspacePackage,
          'exec',
          'pnpm',
          'pack',
          '--config.ignore-scripts=true',
          '--pack-destination',
          packDir,
        ]).pipe(ChildProcess.setCwd(cliDir))
        yield* spawner.string(command).pipe(Effect.orDie)
      }
      const entries = yield* fs.readDirectory(packDir)
      const packed = entries.filter((entry) => entry.endsWith('.tgz'))
      if (packed.length !== WORKSPACE_PACKAGES.length) {
        return yield* Effect.die(
          new Error(
            `expected ${WORKSPACE_PACKAGES.length} tarballs in ${packDir}, found ${packed.length}: ${
              packed.join(', ')
            }`,
          ),
        )
      }

      const startedContainer = yield* Effect.tryPromise({
        try: () =>
          new GenericContainer(NODE_IMAGE)
            .withCopyFilesToContainer(
              packed.map((name) => ({ source: path.join(packDir, name), target: `${TARBALLS_IN_CONTAINER}/${name}` })),
            )
            .withCopyDirectoriesToContainer([{ source: fixturesDir, target: `${WORKDIR}/fixtures` }])
            .withCopyContentToContainer([{ content: WORKSPACE_MANIFEST, target: `${WORKDIR}/package.json` }])
            .withWorkingDir(WORKDIR)
            .withCommand(['sleep', 'infinity'])
            .start(),
        catch: (cause) => cause,
      }).pipe(Effect.orDie)
      container = startedContainer

      const installed = yield* Effect.tryPromise({
        try: () =>
          startedContainer.exec(
            [
              'npm',
              'install',
              '--no-audit',
              '--no-fund',
              '--loglevel=error',
              ...packed.map((name) => `${TARBALLS_IN_CONTAINER}/${name}`),
            ],
            { workingDir: WORKDIR },
          ),
        catch: (cause) => cause,
      }).pipe(Effect.orDie)
      if (installed.exitCode !== 0) {
        return yield* Effect.die(
          new Error(`installing the packed tarball failed with ${installed.exitCode}:\n${installed.output}`),
        )
      }

      project.provide('strykerContainerId', startedContainer.getId())
    }),
  )
}

/**
 * Vitest invokes this once after the run (no arguments) and awaits it.
 * Disposing the runtime closes its root scope, which runs the registered
 * cleanup — container stop and tarball removal — uninterruptibly, with the
 * services of that scope already in context.
 */
export function teardown(): Promise<void> {
  return runtime.dispose()
}
