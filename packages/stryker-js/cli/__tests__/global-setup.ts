/**
 * The contract lane's global setup — owns the container's whole lifetime on
 * the library's EXPLICIT-RELEASE surface (the plan's F5): the launch cell
 * requires an enclosing `Scope` (it registers its teardown finalizer there),
 * so this setup supplies a scope it deliberately never closes — the lane,
 * not the scope, decides when the container dies, and `teardown()` runs the
 * shared teardown executor through the `RunningContainer.stop` surface.
 *
 * Runtime discovery is the library's own (connect-probe, `DOCKER_HOST`
 * authoritative, docker.sock → podman sockets) — the hand-rolled podman
 * probe this file used to carry is gone. When nothing answers, the
 * selection layer fails with the library's `BackendUnreachableError`
 * reciting every probed candidate, and that named error is rethrown here:
 * a dead runtime is a red lane, never a skip.
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
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  interface ProvidedContext {
    strykerContainerId: string
  }
}

const execFileAsync = promisify(execFile)

// Manifest-list digest (not the amd64 platform digest) for tag 22-alpine, resolved 2026-08-10.
const NODE_IMAGE = 'node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32'
// The CLI's workspace dependencies are not on the registry at this version,
// so each one is packed and installed from a local tarball beside it.
const WORKSPACE_PACKAGES = [
  '@systemfsoftware/stryker-js-cli',
  '@systemfsoftware/stryker-js-mutation-run',
  '@systemfsoftware/stryker-js-mutation-report',
  '@systemfsoftware/stryker-js-plugin-api',
  '@systemfsoftware/effect-cell-types',
] as const
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const CLI_DIR = fileURLToPath(new URL('../', import.meta.url))
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url))
const WORKDIR = '/work'
const TARBALLS_IN_CONTAINER = '/opt/tarballs'
const WORKSPACE_MANIFEST = JSON.stringify({ name: 'stryker-contract-workspace', private: true })
// The workspace manifest mounts as a host file beside the tarballs — the
// facade's copy combinators take host paths (there is no content-inline copy).
const WORKSPACE_MANIFEST_FILE = 'workspace-package.json'

/** The running container this lane owns — torn down in `teardown()`, never by a scope. */
let running: RunningContainer | undefined
let tarballDir: string | undefined

/** The docker-pinned lane config: `backend: 'docker'` (never auto), reaper off — teardown owns cleanup. */
const laneConfig = (): RightsizeConfigService => ({
  backend: 'docker',
  reaper: 'off',
  cacheDir: join(tmpdir(), `stryker-contract-cache-${process.pid}`),
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

      const packDir = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'stryker-contract-')))
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
        .withCopyDirectoryToContainer(FIXTURES_DIR, `${WORKDIR}/fixtures`)
        .withCopyFileToContainer(join(packDir, WORKSPACE_MANIFEST_FILE), `${WORKDIR}/package.json`)
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

      // The durable, JSON-threadable identity workers reconstruct by id —
      // this process keeps the running container; every worker execs through
      // the handle alone (F5).
      const handle = ContainerHandle.fromRunning({
        backend: started.backend,
        handle: started.handle,
        spec: started.spec,
      })
      project.provide('strykerContainerId', ContainerHandle.toJson(handle))
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
    }),
  )
}
