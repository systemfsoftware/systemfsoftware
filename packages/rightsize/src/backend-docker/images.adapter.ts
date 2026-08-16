/**
 * Docker `ImageRegistry` adapter — pull/inspect/import image over the Engine
 * API plus the `docker load` shell-out (behavioral reference: upstream
 * rightsize-node `src/backend-docker/backend.ts` `pullIfMissing` at the
 * fork point, Apache-2.0, plus the port plan's R9 "pull with auth").
 *
 * `pull` first inspects the image locally (`GET /images/{ref}/json`) and
 * skips the pull when already present; a missing image triggers
 * `POST /images/create?fromImage=&tag=` whose response is a JSON-lines
 * progress stream. The terminal error frame (and any HTTP >= 400) surfaces
 * as a typed {@link BackendError} naming the daemon's text. When an auth
 * config is supplied, the base64 `X-Registry-Auth` header rides along —
 * the wire `image.schema.ts` owns its encoding.
 *
 * `inspect` is the same 200/404 contract as the checkpoint probe.
 * `importImage` shells out to `docker load -i` (same argv as the checkpoint
 * import; a failure carries the tool's stderr).
 *
 * @since 0.1.0
 */
import { Effect, Option, Schema as S } from 'effect'
import { BackendError } from '../model/errors.js'
import type { ImageRegistryService } from '../runtime/runtime.js'
import { DockerCli, runDockerCli } from './cli.shellout.js'
import type { DockerClient } from './client.js'
import { splitRepoTag } from './repotag.kernel.js'
import { decodeResponseBody } from './response.decode.js'
import { encodeRegistryAuth, ImagePullProgressFrame, type RegistryAuthConfig } from './wire/image.schema.js'

const ARCHIVE_TIMEOUT_MS = 300_000

const encodeQueryValue = (s: string): string => encodeURIComponent(s)

const inspectImageEffect = (client: DockerClient, ref: string): Effect.Effect<boolean, BackendError> =>
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

const pullPathFor = (ref: string): string => {
  const [repo, tag] = splitRepoTag(ref)
  return `/images/create?fromImage=${encodeQueryValue(repo)}&tag=${encodeQueryValue(tag)}`
}

/**
 * Pulls `ref` when missing, streaming the daemon's JSON-lines progress.
 * An HTTP-level failure and the terminal error frame both surface as typed
 * {@link BackendError}s; the daemon's error text rides along.
 */
const pullEffect = (
  client: DockerClient,
  ref: string,
  auth: RegistryAuthConfig | undefined,
): Effect.Effect<void, BackendError> =>
  Effect.gen(function*() {
    const present = yield* inspectImageEffect(client, ref)
    if (present) {
      return
    }

    const path = pullPathFor(ref)
    const resp = auth === undefined
      ? yield* client.request('POST', path)
      : yield* client.requestWithHeaders('POST', path, undefined, { 'X-Registry-Auth': encodeRegistryAuth(auth) })
    if (resp.status >= 400) {
      return yield* BackendError.make({
        message: `docker could not pull image '${ref}' (HTTP ${resp.status}): ${resp.body.toString()}`,
      })
    }

    // The pull body is a JSON-lines progress stream; the terminal error
    // frame is the daemon's failure signal (e.g. auth denied), distinct
    // from an HTTP-level failure above.
    const decoded = yield* scanPullStream(resp.body.toString())
    if (Option.isSome(decoded)) {
      return yield* BackendError.make({ message: `docker could not pull image '${ref}': ${decoded.value}` })
    }
  })

/** Scans a pull progress stream for the terminal error frame; `None` means the pull succeeded. */
const scanPullStream = (body: string): Effect.Effect<Option.Option<string>, never> =>
  Effect.gen(function*() {
    for (const line of body.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.length === 0) {
        continue
      }
      const decoded = yield* decodeResponseBody(ImagePullProgressFrame, 'imagePull')(trimmed).pipe(Effect.option)
      if (Option.isSome(decoded)) {
        const frame = decoded.value
        if (frame.error !== undefined) {
          return Option.some(frame.errorDetail?.message ?? frame.error)
        }
        if (frame.status !== undefined && frame.status.startsWith('error')) {
          return Option.some(frame.status)
        }
      }
    }
    return Option.none()
  })

/** Runs `docker load -i <archivePath>` — a failure carries the tool's stderr. */
const loadArchiveEffect = (archivePath: string): Effect.Effect<void, BackendError> =>
  Effect.tryPromise({
    try: () =>
      runDockerCli(DockerCli.load(archivePath), ARCHIVE_TIMEOUT_MS).then((result) => {
        if (result.exitCode !== 0) {
          throw BackendError.make({
            message: `docker load -i ${archivePath} failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
          })
        }
      }),
    catch: (err) =>
      S.is(BackendError)(err)
        ? err
        : BackendError.make({
          message: `docker load -i ${archivePath} failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        }),
  })

/** The docker {@link ImageRegistryService} over one client, with an optional pull-time registry auth config. */
export const makeDockerImages = (client: DockerClient, auth?: RegistryAuthConfig): ImageRegistryService => ({
  pull: (ref: string) => pullEffect(client, ref, auth),
  inspect: (ref: string) => inspectImageEffect(client, ref),
  importImage: (archivePath: string) => loadArchiveEffect(archivePath),
})
