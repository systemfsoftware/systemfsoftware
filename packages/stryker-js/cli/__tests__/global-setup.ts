import { execFile } from 'node:child_process'
import { access, mkdtemp, readdir, rm } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { GenericContainer, getContainerRuntimeClient, type StartedTestContainer } from 'testcontainers'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  interface ProvidedContext {
    strykerContainerId: string
  }
}

const execFileAsync = promisify(execFile)

const NODE_IMAGE = 'node:22-alpine'
// The CLI's workspace dependencies are not on the registry at this version,
// so each one is packed and installed from a local tarball beside it.
const WORKSPACE_PACKAGES = [
  '@systemfsoftware/stryker-js-cli',
  '@systemfsoftware/stryker-js-mutation-run',
  '@systemfsoftware/stryker-js-mutation-report',
  '@systemfsoftware/effect-cell-types',
] as const
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const CLI_DIR = fileURLToPath(new URL('../', import.meta.url))
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url))
const WORKDIR = '/work'
const TARBALLS_IN_CONTAINER = '/opt/tarballs'

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

/**
 * A host can carry a docker socket FILE that no daemon is listening on while
 * podman serves the real runtime, and testcontainers reads the stale file as
 * the answer rather than falling through. Probing reachability first, and
 * naming podman only when nothing answers on the docker socket, keeps
 * `pnpm check` green on either runtime with no env ritual - and keeps an
 * explicit DOCKER_HOST authoritative.
 */
const selectContainerRuntime = async (): Promise<void> => {
  if (process.env['DOCKER_HOST'] !== undefined) return
  if (await reachable(DOCKER_SOCKET)) return
  for (const candidate of podmanSockets()) {
    if (await reachable(candidate)) {
      process.env['DOCKER_HOST'] = `unix://${candidate}`
      return
    }
  }
}

/**
 * Packing, starting and installing all happen here rather than in a suite hook
 * so the per-hook and per-test budgets stay small enough to catch a real hang.
 * Vitest bounds this function separately, and a failure here fails the run.
 */
export async function setup(project: TestProject): Promise<void> {
  const distEntry = join(CLI_DIR, 'dist', 'main.mjs')
  await access(distEntry).catch(() => {
    throw new Error(`the CLI contract lane needs a built package: ${distEntry} is missing - run \`pnpm build\` first`)
  })

  await selectContainerRuntime()
  await getContainerRuntimeClient().catch((cause: unknown) => {
    throw new Error(
      `the CLI contract lane needs a container runtime, and DOCKER_HOST=${
        process.env['DOCKER_HOST'] ?? '<unset>'
      } is not reachable - tried ${[DOCKER_SOCKET, ...podmanSockets()].join(', ')}`,
      { cause },
    )
  })

  const packDir = await mkdtemp(join(tmpdir(), 'stryker-contract-'))
  tarballDir = packDir
  for (const workspacePackage of WORKSPACE_PACKAGES) {
    await execFileAsync(
      'pnpm',
      ['--filter', workspacePackage, 'exec', 'pnpm', 'pack', '--pack-destination', packDir],
      { cwd: REPO_ROOT },
    )
  }
  const packed = (await readdir(packDir)).filter((entry) => entry.endsWith('.tgz'))
  if (packed.length !== WORKSPACE_PACKAGES.length) {
    throw new Error(
      `expected ${WORKSPACE_PACKAGES.length} tarballs in ${packDir}, found ${packed.length}: ${packed.join(', ')}`,
    )
  }

  container = await new GenericContainer(NODE_IMAGE)
    .withCopyFilesToContainer(
      packed.map((name) => ({ source: join(packDir, name), target: `${TARBALLS_IN_CONTAINER}/${name}` })),
    )
    .withCopyDirectoriesToContainer([{ source: FIXTURES_DIR, target: `${WORKDIR}/fixtures` }])
    .withCopyContentToContainer([{
      content: JSON.stringify({ name: 'stryker-contract-workspace', private: true }),
      target: `${WORKDIR}/package.json`,
    }])
    .withWorkingDir(WORKDIR)
    .withCommand(['sleep', 'infinity'])
    .start()

  const installed = await container.exec(
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
  if (installed.exitCode !== 0) {
    throw new Error(`installing the packed tarball failed with ${installed.exitCode}:\n${installed.output}`)
  }

  project.provide('strykerContainerId', container.getId())
}

export async function teardown(): Promise<void> {
  await container?.stop()
  if (tarballDir !== undefined) await rm(tarballDir, { recursive: true, force: true })
}
