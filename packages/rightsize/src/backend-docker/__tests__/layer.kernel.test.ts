/**
 * `layerDocker` composition tests: the four Tags over one client resolved
 * from the `Selection`'s docker socket path, and the typed failure when the
 * layer is composed under a non-docker selection (it never dials a socket
 * it was not told to dial).
 * Promise-chain test callbacks (no `async`), per the package's effect
 * tsconfig profile.
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { BackendError } from '../../model/errors.js'
import { CheckpointStore, ImageRegistry, SandboxRuntime, VirtualNetworks } from '../../runtime/runtime.js'
import { Selection } from '../../runtime/selection.workflow.js'
import { layerDocker } from '../index.js'
import { withDaemon } from './fake-daemon.js'

const dockerSelection = (socketPath: string) => ({ backend: 'docker' as const, dockerSocketPath: socketPath })

describe('layerDocker composition', () => {
  it('Should_ServeTheFourTags_When_ComposedUnderADockerSelection', () =>
    withDaemon(
      [
        { status: 200, body: JSON.stringify([{ Id: 'found-net' }]) }, // ensureNetwork lookup
        { status: 204, body: '' }, // network remove
      ],
      (daemon) => {
        const program = Effect.provide(
          Effect.gen(function*() {
            const runtime = yield* SandboxRuntime
            const networks = yield* VirtualNetworks
            const checkpoints = yield* CheckpointStore
            const images = yield* ImageRegistry
            yield* networks.ensureNetwork('rz-net-abc12345')
            yield* networks.removeNetwork('rz-net-abc12345')
            return {
              runtimeName: runtime.name,
              checkpoint: runtime.capabilities.checkpoint,
              networks: (id: string) => networks.ensureNetwork(id),
              checkpoints: (ref: string) => checkpoints.hasCheckpoint(ref),
              images: (ref: string) => images.pull(ref),
            }
          }),
          layerDocker,
        )
        const withSelection = Effect.provideService(Selection, dockerSelection(daemon.socketPath))(program)
        return Effect.runPromise(withSelection).then((result) => {
          expect(result.runtimeName).toBe('docker')
          expect(result.checkpoint).toBe(true)
          expect(typeof result.networks).toBe('function')
          expect(typeof result.checkpoints).toBe('function')
          expect(typeof result.images).toBe('function')
          expect(daemon.requests).toHaveLength(2)
          expect(daemon.requests[0]?.url).toContain('/networks?filters=')
        })
      },
    ))

  it('Should_FailTyped_When_ComposedUnderANonDockerSelection', () => {
    const program = Effect.provideService(
      Effect.provide(Effect.map(SandboxRuntime, (runtime) => runtime.name), layerDocker),
      Selection,
      { backend: 'msb', dockerSocketPath: undefined },
    )
    return Effect.runPromise(program).then(
      () => Promise.reject(new Error('expected a non-docker selection failure')),
      (error: unknown) => {
        expect(error).toBeInstanceOf(BackendError)
      },
    )
  })
})
