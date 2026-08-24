import * as Effect from 'effect/Effect'
import { execFile } from 'node:child_process'
import { access, mkdtemp, readdir, rm } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { GenericContainer, getContainerRuntimeClient, type StartedTestContainer } from 'testcontainers'
import type { TestProject } from 'vitest/node'

const execFileAsync = promisify(execFile)

// Manifest-list digest (not the amd64 platform digest) for tag 22-alpine, resolved 2026-08-10.
const NODE_IMAGE = 'node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32'
// Every workspace package in the CLI's transitive closure is packed and
// installed from a local tarball: none is on the registry at this version, so
// one left out of this list is fetched from npm and the install 404s before a
// single test is collected.
const WORKSPACE_PACKAGES = [
  '@systemfsoftware/stryker-js-cli',
  '@systemfsoftware/stryker-js-mutation-run',
  '@systemfsoftware/stryker-js-mutation-report',
  '@systemfsoftware/stryker-js-plugin-api',
  '@systemfsoftware/stryker-js-instrumenter',
  '@systemfsoftware/effect-cell-types',
] as const
const CLI_DIR = fileURLToPath(new URL('./', import.meta.url))
const FIXTURES_DIR = fileURLToPath(new URL('./tests/__fixtures__/fixtures', import.meta.url))
const WORKDIR = '/work'
const TARBALLS_IN_CONTAINER = '/opt/tarballs'
const WORKSPACE_MANIFEST = JSON.stringify({
  name: 'stryker-contract-workspace',
  private: true,
})

let container: StartedTestContainer | undefined
let tarballDir: string | undefined

const DOCKER_SOCKET = '/var/run/docker.sock'

const podmanSockets = (): readonly string[] => {
  const uid = process.getuid?.()
  const runtimeDir = process.env['XDG_RUNTIME_DIR'] ?? (uid === undefined ? undefined : `/run/user/${uid}`)
  const rootless = runtimeDir === undefined ? [] : [join(runtimeDir, 'podman', 'podman.sock')]
  return [...rootless, '/run/podman/podman.sock']
}

const reachable = (socketPath: string): Promise<boolean> => {
  const { promise, resolve } = Promise.withResolvers<boolean>()
  const socket = connect(socketPath)
  const settle = (value: boolean): void => {
    socket.destroy()
    resolve(value)
  }
  socket.once('connect', () => settle(true))
  socket.once('error', () => settle(false))
  return promise
}

const dockerHost = (): string | undefined => process.env['DOCKER_HOST']
const setDockerHost = (host: string): void => {
  process.env['DOCKER_HOST'] = host
}

/**
 * A host can carry a docker socket FILE that no daemon is listening on while
 * podman serves the real runtime, and testcontainers reads the stale file as
 * the answer rather than falling through. Probing reachability first, and
 * naming podman only when nothing answers on the docker socket, keeps
 * `pnpm check` green on either runtime with no env ritual - and keeps an
 * explicit DOCKER_HOST authoritative.
 */
const selectContainerRuntime = Effect.gen(function*() {
  if (dockerHost() !== undefined) return
  if (yield* Effect.promise(() => reachable(DOCKER_SOCKET))) return
  for (const candidate of podmanSockets()) {
    if (yield* Effect.promise(() => reachable(candidate))) {
      setDockerHost(`unix://${candidate}`)
      return
    }
  }
})

/**
 * Packing, starting and installing all happen here rather than in a suite hook
 * so the per-hook and per-test budgets stay small enough to catch a real hang.
 * Vitest bounds this function separately, and a failure here fails the run.
 * The setup is the harness boundary: an Effect program interpreted once
 * through the platform runtime, because vitest's hook API is promise-shaped.
 */
export function setup(project: TestProject): Promise<void> {
  return Effect.runPromise(
    Effect.gen(function*() {
      const distEntry = join(CLI_DIR, 'dist', 'main.mjs')
      const distPresent = yield* Effect.promise(() =>
        access(distEntry).then(
          () => true,
          () => false,
        )
      )
      if (!distPresent) {
        return yield* Effect.die(
          new Error(`the CLI contract lane needs a built package: ${distEntry} is missing - run \`pnpm build\` first`),
        )
      }

      yield* selectContainerRuntime
      yield* Effect.promise(() =>
        getContainerRuntimeClient().catch((cause: unknown) => {
          throw new Error(
            `the CLI contract lane needs a container runtime, and DOCKER_HOST=${
              process.env['DOCKER_HOST'] ?? '<unset>'
            } is not reachable - tried ${[DOCKER_SOCKET, ...podmanSockets()].join(', ')}`,
            { cause },
          )
        })
      )

      const packDir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'stryker-contract-')))
      tarballDir = packDir
      for (const workspacePackage of WORKSPACE_PACKAGES) {
        yield* Effect.promise(() =>
          execFileAsync(
            'pnpm',
            [
              '--filter',
              workspacePackage,
              'exec',
              'pnpm',
              'pack',
              '--config.ignore-scripts=true',
              '--pack-destination',
              packDir,
            ],
            { cwd: CLI_DIR },
          )
        )
      }
      const packed = (yield* Effect.promise(() => readdir(packDir))).filter((entry) => entry.endsWith('.tgz'))
      if (packed.length !== WORKSPACE_PACKAGES.length) {
        return yield* Effect.die(
          new Error(
            `expected ${WORKSPACE_PACKAGES.length} tarballs in ${packDir}, found ${packed.length}: ${
              packed.join(', ')
            }`,
          ),
        )
      }

      const startedContainer = yield* Effect.promise(() =>
        new GenericContainer(NODE_IMAGE)
          .withCopyFilesToContainer(
            packed.map((name) => ({ source: join(packDir, name), target: `${TARBALLS_IN_CONTAINER}/${name}` })),
          )
          .withCopyDirectoriesToContainer([{ source: FIXTURES_DIR, target: `${WORKDIR}/fixtures` }])
          .withCopyContentToContainer([{
            content: WORKSPACE_MANIFEST,
            target: `${WORKDIR}/package.json`,
          }])
          .withWorkingDir(WORKDIR)
          .withCommand(['sleep', 'infinity'])
          .start()
      )
      container = startedContainer

      const installed = yield* Effect.promise(() =>
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
        )
      )
      if (installed.exitCode !== 0) {
        return yield* Effect.die(
          new Error(`installing the packed tarball failed with ${installed.exitCode}:\n${installed.output}`),
        )
      }

      project.provide('strykerContainerId', startedContainer.getId())
    }),
  )
}

export function teardown(): Promise<void> {
  return Effect.runPromise(
    Effect.gen(function*() {
      const started = container
      if (started !== undefined) {
        yield* Effect.promise(() => started.stop())
      }
      const packDir = tarballDir
      if (packDir !== undefined) {
        yield* Effect.promise(() => rm(packDir, { recursive: true, force: true }))
      }
    }),
  )
}
