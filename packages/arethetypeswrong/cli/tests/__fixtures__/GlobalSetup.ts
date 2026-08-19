import { execFile } from 'node:child_process'
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { GenericContainer, getContainerRuntimeClient, type StartedTestContainer } from 'testcontainers'
import type { TestProject } from 'vitest/node'

import { FIXTURE_FILES, FIXTURE_PACKAGE, STUB_REGISTRY_PORT, STUB_REGISTRY_SCRIPT } from './StubRegistry.js'

declare module 'vitest' {
  interface ProvidedContext {
    attwContainerId: string
  }
}

const execFileAsync = promisify(execFile)

// Manifest-list digest (not the amd64 platform digest) for tag 22-alpine, resolved 2026-08-10.
const NODE_IMAGE = 'node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32'

const WORKSPACE_PACKAGES = [
  '@systemfsoftware/arethetypeswrong-cli',
  '@systemfsoftware/arethetypeswrong-core',
] as const

// This file sits in `tests/__fixtures__/`, so the package root is two levels up and
// the workspace root is five. Both were one level short, which sent the lane looking
// for the built entry at `cli/tests/dist/main.mjs` and failing with it missing.
const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url))
const CLI_DIR = fileURLToPath(new URL('../../', import.meta.url))
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url))
const WORKDIR = '/work'
const TARBALLS_IN_CONTAINER = '/opt/tarballs'
const STUB_SCRIPT_PATH = `${WORKDIR}/stub-registry.mjs`
const FIXTURE_TARBALL_IN_CONTAINER = `${TARBALLS_IN_CONTAINER}/${FIXTURE_PACKAGE.name}-${FIXTURE_PACKAGE.version}.tgz`

let attwContainer: StartedTestContainer | undefined
let tarballDir: string | undefined
let fixtureDir: string | undefined

export async function setup(project: TestProject): Promise<void> {
  const distEntry = join(CLI_DIR, 'dist', 'main.mjs')
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

  fixtureDir = await mkdtemp(join(tmpdir(), 'attw-fixture-pkg-'))
  await writeFile(join(fixtureDir, 'package.json'), JSON.stringify(FIXTURE_PACKAGE, null, 2))
  for (const [name, content] of Object.entries(FIXTURE_FILES)) {
    await writeFile(join(fixtureDir, name), content)
  }
  await execFileAsync('npm', ['pack'], { cwd: fixtureDir })
  const fixtureTarball = join(fixtureDir, `${FIXTURE_PACKAGE.name}-${FIXTURE_PACKAGE.version}.tgz`)

  attwContainer = await new GenericContainer(NODE_IMAGE)
    .withCopyFilesToContainer(
      [
        ...packed.map((name) => ({ source: join(packDir, name), target: `${TARBALLS_IN_CONTAINER}/${name}` })),
        { source: fixtureTarball, target: FIXTURE_TARBALL_IN_CONTAINER },
      ],
    )
    .withCopyContentToContainer([
      { content: STUB_REGISTRY_SCRIPT, target: STUB_SCRIPT_PATH },
      {
        content: JSON.stringify({ name: 'attw-contract-workspace', private: true }),
        target: `${WORKDIR}/package.json`,
      },
    ])
    .withCopyDirectoriesToContainer([{ source: FIXTURES_DIR, target: `${WORKDIR}/fixtures` }])
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

  // npm exits 0 even when it silently skips a bin whose target is missing from the
  // tarball, so a green install does not imply a runnable binary. Relink the bin
  // explicitly and then assert it, so the lane's own precondition names the failure.
  const relink = await attwContainer.exec(
    ['npm', 'rebuild', '@systemfsoftware/arethetypeswrong-cli', '--no-audit', '--no-fund', '--loglevel=error'],
    { workingDir: WORKDIR },
  )
  if (relink.exitCode !== 0) {
    throw new Error(
      `relinking the attw bin failed with ${relink.exitCode}. install output:\n${installed.output}\nrelink output:\n${relink.output}`,
    )
  }
  const binOk = await attwContainer.exec(['sh', '-c', 'test -x node_modules/.bin/attw && echo ok'], {
    workingDir: WORKDIR,
  })
  if (binOk.exitCode !== 0 || binOk.stdout.trim() !== 'ok') {
    throw new Error(
      `the installed CLI has no runnable bin: node_modules/.bin/attw is missing in the container. ` +
        `This means the packed tarball lost its dist/ entry or its bin field. ` +
        `install output:\n${installed.output}\nrelink output:\n${relink.output}`,
    )
  }

  const stubStart = await attwContainer.exec(
    ['sh', '-c', `nohup node ${STUB_SCRIPT_PATH} ${FIXTURE_TARBALL_IN_CONTAINER} > /tmp/stub.log 2>&1 &`],
    { workingDir: WORKDIR },
  )
  if (stubStart.exitCode !== 0) {
    throw new Error(`starting the stub registry failed: ${stubStart.output}`)
  }
  // Poll until the stub answers, so the --from-npm scenario never races the server startup.
  for (let attempt = 0; attempt < 40; attempt++) {
    const probe = await attwContainer.exec([
      'node',
      '-e',
      `fetch('http://localhost:${STUB_REGISTRY_PORT}/${FIXTURE_PACKAGE.name}/latest').then(r=>r.text()).then(()=>process.exit(0)).catch(()=>process.exit(1))`,
    ])
    if (probe.exitCode === 0) break
    if (attempt === 39) {
      const log = await attwContainer.exec(['cat', '/tmp/stub.log'])
      throw new Error(`stub registry did not start within 20s. stub log:\n${log.output}`)
    }
    await sleep(500)
  }

  project.provide('attwContainerId', attwContainer.getId())
}

export async function teardown(): Promise<void> {
  await attwContainer?.stop()
  if (tarballDir !== undefined) await rm(tarballDir, { recursive: true, force: true })
  if (fixtureDir !== undefined) await rm(fixtureDir, { recursive: true, force: true })
}
