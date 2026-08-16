/**
 * The contract lane's global setup — owns the container's whole lifetime on
 * the library's EXPLICIT-RELEASE surface (the plan's F5): the launch cell
 * requires an enclosing `Scope` (it registers its teardown finalizer there),
 * so this setup supplies a scope it deliberately never closes — the lane,
 * not the scope, decides when the container dies, and `teardown()` runs the
 * shared teardown executor through the `RunningContainer.stop` surface.
 *
 * Runtime discovery is the library's own (connect-probe, `DOCKER_HOST`
 * authoritative, docker.sock → podman sockets) — the lane previously had no
 * podman probe at all (testcontainers' docker.sock-only client failed on
 * podman-only hosts); the library's discovery walk finds
 * /run/podman/podman.sock. When nothing answers, the selection layer fails
 * with the library's `BackendUnreachableError` reciting every probed
 * candidate, and that named error is rethrown here: a dead runtime is a red
 * lane, never a skip.
 *
 * Packing, starting and installing all happen here rather than in a suite
 * hook so the per-hook and per-test budgets stay small enough to catch a
 * real hang. Vitest bounds this function separately, and a failure here
 * fails the run. The setup is the harness boundary: an Effect program
 * interpreted once through the platform runtime, because vitest's hook
 * API is promise-shaped.
 */
import {
  BackendUnreachableError,
  ContainerHandle,
  fromImage,
  layerAuto,
  layerRuntimeDiscovery,
  RightsizeConfig,
  type RightsizeConfigService,
  type RunningContainer,
  Selection,
} from '@systemfsoftware/rightsize'
import { layerDocker } from '@systemfsoftware/rightsize/backend-docker'
import { Effect, Layer, Schema } from 'effect'
import * as Scope from 'effect/Scope'
import { execFile } from 'node:child_process'
import { access, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { TestProject } from 'vitest/node'

import { FIXTURE_FILES, FIXTURE_PACKAGE, STUB_REGISTRY_PORT, STUB_REGISTRY_SCRIPT } from './stub-registry.js'

declare module 'vitest' {
  interface ProvidedContext {
    // The durable by-id handle JSON workers reconstruct their `Container`
    // service from — not a raw testcontainers id (F5).
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

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const CLI_DIR = fileURLToPath(new URL('../', import.meta.url))
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url))
const WORKDIR = '/work'
const TARBALLS_IN_CONTAINER = '/opt/tarballs'
const STUB_SCRIPT_PATH = `${WORKDIR}/stub-registry.mjs`
const FIXTURE_TARBALL_IN_CONTAINER = `${TARBALLS_IN_CONTAINER}/${FIXTURE_PACKAGE.name}-${FIXTURE_PACKAGE.version}.tgz`
// Content-based copies are not modeled by the facade (it takes host paths),
// so the stub script and the workspace manifest land in the guest as host
// files written beside the packed tarballs.
const STUB_SCRIPT_FILE = 'stub-registry.mjs'
const WORKSPACE_MANIFEST_FILE = 'workspace-package.json'
const WORKSPACE_MANIFEST = JSON.stringify({ name: 'attw-contract-workspace', private: true })

/** The running container this lane owns — torn down in `teardown()`, never by a scope. */
let running: RunningContainer | undefined
let tarballDir: string | undefined
let fixtureDir: string | undefined

/** The docker-pinned lane config: `backend: 'docker'` (never auto), reaper off — teardown owns cleanup. */
const laneConfig = (): RightsizeConfigService => ({
  backend: 'docker',
  reaper: 'off',
  cacheDir: join(tmpdir(), `attw-contract-cache-${process.pid}`),
  reuse: false,
  msbPath: undefined,
  msbSkipDownload: true,
})

/** The selection seam — the library's discovery decides, exactly as the lane layer does below. */
const selectionLayer = layerAuto({ msbSupported: false }).pipe(
  Layer.provideMerge(Layer.mergeAll(Layer.succeed(RightsizeConfig, laneConfig()), layerRuntimeDiscovery)),
)

/** The lane layer: the docker backend resolved over the library's own discovery (the parity-lane shape). */
const laneLayer = layerDocker.pipe(
  Layer.provideMerge(layerAuto({ msbSupported: false })),
  Layer.provideMerge(Layer.mergeAll(Layer.succeed(RightsizeConfig, laneConfig()), layerRuntimeDiscovery)),
)

/**
 * Packing, starting and installing all happen here rather than in a suite hook
 * so the per-hook and per-test budgets stay small enough to catch a real hang.
 * Vitest bounds this function separately, and a failure here fails the run.
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

      // Preflight the runtime through the library's own discovery — a dead
      // daemon fails the run with the named `BackendUnreachableError`
      // (reciting every probed candidate) before anything expensive happens.
      // Reading `Selection` forces the selection layer to build: that is
      // where the connect probes and the decide run.
      yield* Effect.as(Selection, undefined).pipe(Effect.provide(selectionLayer))

      const packDir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'attw-contract-packs-')))
      tarballDir = packDir
      for (const workspacePackage of WORKSPACE_PACKAGES) {
        yield* Effect.promise(() =>
          execFileAsync(
            'pnpm',
            ['--filter', workspacePackage, 'exec', 'pnpm', 'pack', '--pack-destination', packDir],
            { cwd: REPO_ROOT },
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
      yield* Effect.promise(() => writeFile(join(packDir, WORKSPACE_MANIFEST_FILE), WORKSPACE_MANIFEST))
      yield* Effect.promise(() => writeFile(join(packDir, STUB_SCRIPT_FILE), STUB_REGISTRY_SCRIPT))

      // The fixture package is packed on the host (npm pack) so the
      // --from-npm scenario has a real tarball the stub registry serves.
      const fxDir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'attw-fixture-pkg-')))
      fixtureDir = fxDir
      yield* Effect.promise(() => writeFile(join(fxDir, 'package.json'), JSON.stringify(FIXTURE_PACKAGE, null, 2)))
      for (const [name, content] of Object.entries(FIXTURE_FILES)) {
        yield* Effect.promise(() => writeFile(join(fxDir, name), content))
      }
      yield* Effect.promise(() => execFileAsync('npm', ['pack'], { cwd: fxDir }))
      const fixtureTarball = join(fxDir, `${FIXTURE_PACKAGE.name}-${FIXTURE_PACKAGE.version}.tgz`)

      // Launch the digest-pinned node image through the fluent facade, under
      // a scope the lane never closes: the launch cell's teardown finalizer
      // is registered but never runs — the lane owns the lifetime and stops
      // the container explicitly in `teardown()` (explicit release, R5/KTD5).
      const scope = yield* Scope.make()
      let builder = fromImage(NODE_IMAGE)
      for (const name of packed) {
        builder = builder.withCopyFileToContainer(join(packDir, name), `${TARBALLS_IN_CONTAINER}/${name}`)
      }
      const started = yield* builder
        .withCopyFileToContainer(fixtureTarball, FIXTURE_TARBALL_IN_CONTAINER)
        .withCopyFileToContainer(join(packDir, STUB_SCRIPT_FILE), STUB_SCRIPT_PATH)
        .withCopyFileToContainer(join(packDir, WORKSPACE_MANIFEST_FILE), `${WORKDIR}/package.json`)
        .withCopyDirectoryToContainer(FIXTURES_DIR, `${WORKDIR}/fixtures`)
        .withWorkingDir(WORKDIR)
        .withCommand('sleep', 'infinity')
        .start()
        .pipe(Effect.provideService(Scope.Scope, scope), Effect.provide(laneLayer))
      running = started

      const installed = yield* started
        .exec({
          command: [
            'npm',
            'install',
            '--no-audit',
            '--no-fund',
            '--loglevel=error',
            ...packed.map((name) => `${TARBALLS_IN_CONTAINER}/${name}`),
          ],
          workingDir: WORKDIR,
          env: [],
        })
        .pipe(Effect.provide(laneLayer))
      if (installed.exitCode !== 0) {
        return yield* Effect.die(
          new Error(
            `installing the packed tarball failed with ${installed.exitCode}:\n${installed.stderr || installed.stdout}`,
          ),
        )
      }

      const stubStart = yield* started
        .exec({
          command: [
            'sh',
            '-c',
            `nohup node ${STUB_SCRIPT_PATH} ${FIXTURE_TARBALL_IN_CONTAINER} > /tmp/stub.log 2>&1 &`,
          ],
          workingDir: WORKDIR,
          env: [],
        })
        .pipe(Effect.provide(laneLayer))
      if (stubStart.exitCode !== 0) {
        return yield* Effect.die(
          new Error(`starting the stub registry failed: ${stubStart.stderr || stubStart.stdout}`),
        )
      }
      // Poll until the stub answers, so the --from-npm scenario never races
      // the server startup. The probe's exit code stays a verdict — the
      // failure branch reads the stub's own log on the final attempt.
      for (let attempt = 0; attempt < 40; attempt++) {
        const probe = yield* started
          .exec({
            command: [
              'node',
              '-e',
              `fetch('http://localhost:${STUB_REGISTRY_PORT}/${FIXTURE_PACKAGE.name}/latest').then(r=>r.text()).then(()=>process.exit(0)).catch(()=>process.exit(1))`,
            ],
            workingDir: WORKDIR,
            env: [],
          })
          .pipe(Effect.provide(laneLayer))
        if (probe.exitCode === 0) break
        if (attempt === 39) {
          const log = yield* started
            .exec({ command: ['cat', '/tmp/stub.log'], workingDir: WORKDIR, env: [] })
            .pipe(Effect.provide(laneLayer))
          return yield* Effect.die(
            new Error(`stub registry did not start within 20s. stub log:\n${log.stdout || log.stderr}`),
          )
        }
        yield* Effect.promise(() => sleep(500))
      }

      // The durable, JSON-threadable identity workers reconstruct by id —
      // this process keeps the running container; every worker execs through
      // the handle alone (F5).
      const handle = ContainerHandle.fromRunning({
        backend: started.backend,
        handle: started.handle,
        spec: started.spec,
      })
      project.provide('attwContainerId', ContainerHandle.toJson(handle))
    }),
  ).catch((error: unknown) => {
    if (Schema.is(BackendUnreachableError)(error)) {
      // The lane's named unreachable-runtime contract — the typed failure
      // recites every probed candidate.
      throw new Error(
        `the CLI contract lane needs a container runtime, and none of the discovery probes answered.\n` +
          `requested=${error.requested}\n` +
          `probes=${JSON.stringify(error.probes, null, 2)}\n` +
          `(the lane fails — it never skips)`,
      )
    }
    throw error
  })
}

export function teardown(): Promise<void> {
  return Effect.runPromise(
    Effect.gen(function*() {
      const started = running
      if (started !== undefined) {
        // The shared teardown executor: stop → remove → unregister → untrack
        // → release-ports, idempotent. A layer failure here is a defect — the
        // lane must never silently leave its container behind.
        yield* started.stop.pipe(Effect.provide(laneLayer.pipe(Layer.orDie)))
      }
      const packDir = tarballDir
      if (packDir !== undefined) {
        yield* Effect.promise(() => rm(packDir, { recursive: true, force: true }))
      }
      const fxDir = fixtureDir
      if (fxDir !== undefined) {
        yield* Effect.promise(() => rm(fxDir, { recursive: true, force: true }))
      }
    }),
  )
}
