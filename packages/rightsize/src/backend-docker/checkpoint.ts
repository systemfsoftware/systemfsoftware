/**
 * Docker `CheckpointStore` adapter — commit-to-image checkpointing
 * (behavioral reference: upstream rightsize-node
 * `src/backend-docker/backend.ts` checkpoint methods at the fork point,
 * Apache-2.0).
 *
 * `createCheckpoint` is the engine's `POST /commit` endpoint, which commits
 * a container's current filesystem to a new image in one call — the
 * container itself is undisturbed (`checkpointRestartsWorkload` is `false`
 * for docker). `removeCheckpoint` is a best-effort `DELETE /images/{ref}`;
 * `hasCheckpoint` is the same `GET /images/{ref}/json` inspect the pull
 * path uses — `200` means present, `404` means absent, and any other status
 * is a probe failure that throws rather than reporting a silent `false`.
 *
 * `exportCheckpoint`/`importCheckpoint` shell out to `docker save`/`load`
 * exactly where upstream does: `docker save`/`load` preserve the original
 * tag round-trip (loading over an existing tag re-points it), unlike msb's
 * digest-derived import naming, so the effective ref after an import is the
 * ref itself (the shell-out shares `cli.ts`'s run contract).
 *
 * @since 0.1.0
 */
import { Effect, Schema as S } from 'effect'
import { BackendError } from '../model/errors.js'
import type { CheckpointStoreService, SandboxHandle } from '../runtime/runtime.js'
import { DockerCli, runDockerCli } from './cli.js'
import type { DockerClient } from './client.js'
import { splitRepoTag } from './repotag.js'

// `docker save`/`load` move a full image layer set, not a single file —
// more generous than a plain `docker cp`.
const ARCHIVE_TIMEOUT_MS = 300_000

const encodeQueryValue = (s: string): string => encodeURIComponent(s)

const createCheckpointEffect = (
  client: DockerClient,
  handle: SandboxHandle,
  ref: string,
): Effect.Effect<void, BackendError> =>
  Effect.gen(function*() {
    const [repo, tag] = splitRepoTag(ref)
    const path = `/commit?container=${encodeQueryValue(handle.id)}&repo=${encodeQueryValue(repo)}&tag=${
      encodeQueryValue(tag)
    }`
    const resp = yield* client.request('POST', path)
    if (resp.status >= 400) {
      return yield* BackendError.make({
        message:
          `docker could not commit container ${handle.id} to image '${ref}' (HTTP ${resp.status}): ${resp.body.toString()}`,
      })
    }
  })

const hasCheckpointEffect = (client: DockerClient, ref: string): Effect.Effect<boolean, BackendError> =>
  Effect.gen(function*() {
    const resp = yield* client.request('GET', `/images/${encodeQueryValue(ref)}/json`)
    if (resp.status === 200) {
      return true
    }
    if (resp.status === 404) {
      return false
    }
    return yield* BackendError.make({
      message: `docker could not inspect image '${ref}' (HTTP ${resp.status}): ${resp.body.toString()}`,
    })
  })

/** Runs one `docker <args>` shell-out, failing with `description` + the tool's stderr on a nonzero exit. */
const cliEffect = (args: readonly string[], description: string): Effect.Effect<void, BackendError> =>
  Effect.tryPromise({
    try: () =>
      runDockerCli(args, ARCHIVE_TIMEOUT_MS).then((result) => {
        if (result.exitCode !== 0) {
          throw BackendError.make({
            message: `${description} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
          })
        }
      }),
    catch: (err) =>
      S.is(BackendError)(err)
        ? err
        : BackendError.make({
          message: `${description} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        }),
  })

/** The docker {@link CheckpointStoreService} over one client. */
export const makeDockerCheckpoints = (client: DockerClient): CheckpointStoreService => ({
  createCheckpoint: (handle: SandboxHandle, ref: string) => createCheckpointEffect(client, handle, ref),
  removeCheckpoint: (ref: string) =>
    // Best-effort `DELETE /images/{ref}` — "not found" is success, the same contract as `removeByName`.
    client.request('DELETE', `/images/${encodeQueryValue(ref)}`).pipe(Effect.asVoid, Effect.ignore),
  hasCheckpoint: (ref: string) => hasCheckpointEffect(client, ref),
  exportCheckpoint: (ref: string, destFile: string) =>
    cliEffect(DockerCli.save(destFile, ref), `docker save -o ${destFile} ${ref}`),
  importCheckpoint: (srcFile: string, ref: string) =>
    cliEffect(DockerCli.load(srcFile), `docker load -i ${srcFile}`).pipe(Effect.map(() => ref)),
})
