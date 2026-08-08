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
// The CLI's workspace dependencies are not on the registry at this version,
// so each one is packed and installed from a local tarball beside it.
const WORKSPACE_PACKAGES = [
  '@systemfsoftware/stryker-js-cli',
  '@systemfsoftware/stryker-js-mutation-run',
  '@systemfsoftware/effect-cell-types',
] as const
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const CLI_DIR = fileURLToPath(new URL('../', import.meta.url))
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url))
const WORKDIR = '/work'
const TARBALLS_IN_CONTAINER = '/opt/tarballs'

let container: StartedTestContainer | undefined
let tarballDir: string | undefined

/**
 * Packing, starting and installing all happen here rather than in a suite hook
 * so the per-hook and per-test budgets stay small enough to catch a real hang.
 * Vitest bounds this function separately, and a failure here fails the run.
 */
export async function setup(project: TestProject): Promise<void> {
  const distEntry = join(CLI_DIR, 'dist', 'index.mjs')
  await access(distEntry).catch(() => {
    throw new Error(`the CLI contract lane needs a built package: ${distEntry} is missing - run \`pnpm build\` first`)
  })

  await getContainerRuntimeClient().catch((cause: unknown) => {
    throw new Error(
      `the CLI contract lane needs a container runtime, and DOCKER_HOST=${
        process.env['DOCKER_HOST'] ?? '<unset>'
      } is not reachable`,
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
