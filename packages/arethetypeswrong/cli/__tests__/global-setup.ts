import { execFile } from 'node:child_process'
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { GenericContainer, getContainerRuntimeClient, type StartedTestContainer } from 'testcontainers'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  interface ProvidedContext {
    attwContainerId: string
    verdaccioContainerId: string
  }
}

const execFileAsync = promisify(execFile)

const NODE_IMAGE = 'node:22-alpine'
const VERDACCIO_IMAGE = 'verdaccio/verdaccio:6'
const VERDACCIO_PORT = 4873

// The CLI's workspace dependencies are not on the registry at this version,
// so each is packed and installed from a local tarball beside it.
const WORKSPACE_PACKAGES = [
  '@systemfsoftware/arethetypeswrong-cli',
  '@systemfsoftware/arethetypeswrong-core',
] as const

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const CLI_DIR = fileURLToPath(new URL('../', import.meta.url))
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url))
const WORKDIR = '/work'
const TARBALLS_IN_CONTAINER = '/opt/tarballs'

const VERDACCIO_CONFIG = `
storage: /verdaccio/storage/data
packages:
  '@*/*':
    access: $all
    publish: $all
    unpublish: $all
  '**':
    access: $all
    publish: $all
    unpublish: $all
`

let attwContainer: StartedTestContainer | undefined
let verdaccioContainer: StartedTestContainer | undefined
let tarballDir: string | undefined
let publishDir: string | undefined

export async function setup(project: TestProject): Promise<void> {
  const distEntry = join(CLI_DIR, 'dist', 'index.mjs')
  await access(distEntry).catch(() => {
    throw new Error(
      `the CLI contract lane needs a built package: ${distEntry} is missing - run \`pnpm build\` first`,
    )
  })

  await getContainerRuntimeClient().catch((cause: unknown) => {
    throw new Error(
      `the CLI contract lane needs a container runtime, and DOCKER_HOST=${
        process.env['DOCKER_HOST'] ?? '<unset>'
      } is not reachable`,
      { cause },
    )
  })

  const packDir = await mkdtemp(join(tmpdir(), 'attw-contract-packs-'))
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

  verdaccioContainer = await new GenericContainer(VERDACCIO_IMAGE)
    .withCopyContentToContainer([{ content: VERDACCIO_CONFIG, target: '/verdaccio/conf/config.yaml' }])
    .withExposedPorts(VERDACCIO_PORT)
    .withCommand(['verdaccio', '--config', '/verdaccio/conf/config.yaml', '--listen', '0.0.0.0:4873'])
    .start()

  const verdaccioBaseUrl = `http://${verdaccioContainer.getHost()}:${
    verdaccioContainer.getMappedPort(
      VERDACCIO_PORT,
    )
  }/`

  publishDir = await mkdtemp(join(tmpdir(), 'attw-fixture-pkg-'))
  await writeFile(
    join(publishDir, 'package.json'),
    JSON.stringify(
      {
        name: 'attw-fixture-pkg',
        version: '1.0.0',
        description: 'fixture for attw --from-npm contract scenarios',
        type: 'module',
        main: 'index.js',
        types: 'index.d.ts',
        files: ['index.js', 'index.d.ts'],
      },
      null,
      2,
    ),
  )
  await writeFile(join(publishDir, 'index.js'), 'export const value = 1\n')
  await writeFile(join(publishDir, 'index.d.ts'), 'export declare const value: number\n')

  const published = await execFileAsync(
    'npm',
    ['publish', '--registry', verdaccioBaseUrl, '--loglevel=error', '--userconfig', join(publishDir, '.npmrc')],
    { cwd: publishDir, env: { ...process.env, npm_config_registry: verdaccioBaseUrl } },
  )
  if (!published.stdout.includes('+ attw-fixture-pkg@1.0.0')) {
    throw new Error(
      `publishing fixture to verdaccio failed: stderr=${published.stderr}\nstdout=${published.stdout}`,
    )
  }

  attwContainer = await new GenericContainer(NODE_IMAGE)
    .withCopyFilesToContainer(
      packed.map((name) => ({ source: join(packDir, name), target: `${TARBALLS_IN_CONTAINER}/${name}` })),
    )
    .withCopyDirectoriesToContainer([{ source: FIXTURES_DIR, target: `${WORKDIR}/fixtures` }])
    .withCopyContentToContainer([{
      content: JSON.stringify({ name: 'attw-contract-workspace', private: true }),
      target: `${WORKDIR}/package.json`,
    }])
    .withWorkingDir(WORKDIR)
    .withCommand(['sleep', 'infinity'])
    .start()

  const installed = await attwContainer.exec(
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

  project.provide('attwContainerId', attwContainer.getId())
  project.provide('verdaccioContainerId', verdaccioContainer.getId())
}

export async function teardown(): Promise<void> {
  await attwContainer?.stop()
  await verdaccioContainer?.stop()
  if (tarballDir !== undefined) await rm(tarballDir, { recursive: true, force: true })
  if (publishDir !== undefined) await rm(publishDir, { recursive: true, force: true })
}
