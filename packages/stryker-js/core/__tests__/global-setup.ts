import { execFile } from 'node:child_process'
import { access, mkdtemp, readdir, rm } from 'node:fs/promises'
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
const CORE_PACKAGE = '@systemfsoftware/stryker-js-core'
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const CORE_DIR = fileURLToPath(new URL('../', import.meta.url))
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url))
const WORKDIR = '/work'
const TARBALL_IN_CONTAINER = '/opt/core.tgz'

let container: StartedTestContainer | undefined
let tarballDir: string | undefined

/**
 * Packing, starting and installing all happen here rather than in a suite hook
 * so the per-hook and per-test budgets stay small enough to catch a real hang.
 * Vitest bounds this function separately, and a failure here fails the run.
 */
export async function setup(project: TestProject): Promise<void> {
  const distEntry = join(CORE_DIR, 'dist', 'index.mjs')
  await access(distEntry).catch(() => {
    throw new Error(`the CLI contract lane needs a built package: ${distEntry} is missing - run \`pnpm build\` first`)
  })

  await getContainerRuntimeClient().catch((cause: unknown) => {
    throw new Error(
      `the CLI contract lane needs a container runtime, and DOCKER_HOST=${
        process.env['DOCKER_HOST'] ?? '<unset>'
      } is not reachable: ${String(cause)}`,
    )
  })

  tarballDir = await mkdtemp(join(tmpdir(), 'stryker-contract-'))
  await execFileAsync(
    'pnpm',
    ['--filter', CORE_PACKAGE, 'exec', 'pnpm', 'pack', '--pack-destination', tarballDir],
    { cwd: REPO_ROOT },
  )
  const packed = (await readdir(tarballDir)).find((entry) => entry.endsWith('.tgz'))
  if (packed === undefined) throw new Error(`pnpm pack wrote no tarball into ${tarballDir}`)

  container = await new GenericContainer(NODE_IMAGE)
    .withCopyFilesToContainer([{ source: join(tarballDir, packed), target: TARBALL_IN_CONTAINER }])
    .withCopyDirectoriesToContainer([{ source: FIXTURES_DIR, target: `${WORKDIR}/fixtures` }])
    .withCopyContentToContainer([{
      content: JSON.stringify({ name: 'stryker-contract-workspace', private: true }),
      target: `${WORKDIR}/package.json`,
    }])
    .withWorkingDir(WORKDIR)
    .withCommand(['sleep', 'infinity'])
    .start()

  const installed = await container.exec(
    ['npm', 'install', '--no-audit', '--no-fund', '--loglevel=error', TARBALL_IN_CONTAINER],
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
