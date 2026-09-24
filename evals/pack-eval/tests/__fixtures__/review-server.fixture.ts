import { NodeHttpServer } from '@effect/platform-node'
import { PackEval } from '@systemfsoftware/pack-eval'
import { Context, Effect, Layer, Option, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as FetchHttpClient from 'effect/unstable/http/FetchHttpClient'
import * as HttpClient from 'effect/unstable/http/HttpClient'
import type * as HttpClientError from 'effect/unstable/http/HttpClientError'
import * as HttpClientRequest from 'effect/unstable/http/HttpClientRequest'
import * as HttpServer from 'effect/unstable/http/HttpServer'
import * as NetAddress from 'effect/unstable/net/NetAddress'
import { createServer } from 'node:http'
import {
  writeCandidateTasksOf,
  writeDatasetFilesOf,
  writePackRulesOf,
  writeSelectionTracesOf,
} from './pack-eval-dataset.fixture.js'
import type { World } from './pack-eval-world.fixture.js'

/**
 * The review server reads one pack directory, whose name is the pack id. A review world holds
 * this pack alone, so `writeWorld` lays it out where the server looks for it.
 */
export const reviewPackId = 'greenhouse'

/** One review reply as text, before the route's own schema decodes it. */
interface TextReply {
  readonly status: number
  readonly body: string
}

/** The directories and address one review scenario talks to. */
export interface ReviewLocations {
  readonly datasetDir: string
  readonly workDir: string
  readonly packsRoot: string
  readonly baseUrl: string
}

/** The dataset, work directory, and running review server one scenario talks to. */
export class ReviewFixture extends Context.Service<ReviewFixture, ReviewLocations>()(
  '@systemfsoftware/pack-eval/tests/__fixtures__/review-server.fixture/ReviewFixture',
) {}

/** The element at an index, or a failure naming what the world should have held. */
export const requiredElementOf = <T>(options: {
  readonly values: ReadonlyArray<T>
  readonly index: number
  readonly what: string
}): T => {
  const found = options.values[options.index]
  if (found === undefined) throw new Error(`the world holds no ${options.what} at ${options.index}`)
  return found
}

export const taskPathOf = (taskId: string): string => `/api/tasks/${encodeURIComponent(taskId)}`

export const labelsPathOf = (options: { readonly taskId: string; readonly packId: string }): string =>
  `${taskPathOf(options.taskId)}/labels?pack=${encodeURIComponent(options.packId)}`

export const pairsPathOf = (options: { readonly taskId: string; readonly packId: string }): string =>
  `${taskPathOf(options.taskId)}/pairs?pack=${encodeURIComponent(options.packId)}`

export const writeWorld = (options: { readonly locations: ReviewLocations; readonly world: World }) =>
  Effect.gen(function*() {
    const locations = options.locations
    const world = options.world
    yield* writePackRulesOf({ world, packsRoot: locations.packsRoot })
    yield* writeDatasetFilesOf({ world, datasetDir: locations.datasetDir })
    yield* writeCandidateTasksOf({ world, workDir: locations.workDir })
    yield* writeSelectionTracesOf({ world, workDir: locations.workDir })
  })

export const taskSetOf = (locations: ReviewLocations) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    return yield* PackEval.DatasetFiles.readJson(paths.join(locations.datasetDir, 'tasks.json'), PackEval.TaskSet)
  })

export const pairLabelsTextOf = (locations: ReviewLocations) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.readFileString(paths.join(locations.datasetDir, 'pair-labels.json'))
  })

export const routingLabelsOf = (locations: ReviewLocations) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    return yield* PackEval.DatasetFiles.readJson(
      paths.join(locations.datasetDir, 'routing-labels.json'),
      PackEval.RoutingLabels,
    )
  })

/** Write a marker file under the work directory, to prove a later write did not land there. */
export const writeMarkerOf = (options: {
  readonly locations: ReviewLocations
  readonly relative: string
  readonly content: string
}) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    yield* fileSystem.writeFileString(paths.join(options.locations.workDir, options.relative), options.content)
  })

/** Read a marker file the work directory holds. */
export const markerTextOf = (options: { readonly locations: ReviewLocations; readonly relative: string }) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.readFileString(paths.join(options.locations.workDir, options.relative))
  })

/** Send one review request and read its reply as text. */
export const textRequest = (options: {
  readonly locations: ReviewLocations
  readonly method: 'GET' | 'POST' | 'PUT'
  readonly path: string
  readonly body?: Schema.Json
}): Effect.Effect<TextReply, HttpClientError.HttpClientError, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const request = HttpClientRequest.make(options.method)(
      new URL(options.path, `${options.locations.baseUrl}/`).toString(),
    )
    const withBody = Option.match(Option.fromUndefinedOr(options.body), {
      onNone: () => request,
      onSome: (body) => HttpClientRequest.bodyJsonUnsafe(request, body),
    })
    const response = yield* HttpClient.execute(withBody)
    const body = yield* response.text
    return { status: response.status, body }
  })

/**
 * Decode a reply text by its route schema: the wire speaks plain JSON, and the route schema
 * says which shape that JSON must hold. A text that fails the schema is the server's bug, so
 * the decode runs in the step where the route is exercised.
 */
export const decodeReply = <S extends Schema.Constraint>(
  schema: S,
) =>
(reply: TextReply): Effect.Effect<S['Type'], Schema.SchemaError, S['DecodingServices']> =>
  Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(reply.body).pipe(
    Effect.flatMap((unknownBody) => Schema.decodeUnknownEffect(schema)(unknownBody)),
  )

const boundBaseUrl = (address: NetAddress.InetAddress): string => Result.getOrThrow(NetAddress.toUrl(address)).origin

const locationsLayer = Layer.unwrap(
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    const base = yield* fileSystem.makeTempDirectoryScoped()
    const datasetDir = paths.join(base, 'dataset')
    const workDir = paths.join(base, 'work')
    const packsRoot = paths.join(base, 'packs')
    const packDir = paths.join(packsRoot, reviewPackId)
    yield* fileSystem.makeDirectory(datasetDir, { recursive: true })
    yield* fileSystem.makeDirectory(workDir, { recursive: true })
    yield* fileSystem.makeDirectory(packDir, { recursive: true })
    const server = yield* HttpServer.HttpServer
    if (NetAddress.isUnixPathAddress(server.address)) {
      return yield* Effect.die(new Error('the review server listened on a unix socket'))
    }
    const locations: ReviewLocations = {
      datasetDir,
      workDir,
      packsRoot,
      baseUrl: boundBaseUrl(server.address),
    }
    return Layer.mergeAll(
      Layer.succeed(ReviewFixture, locations),
      PackEval.ReviewServer.layer({ datasetDir, workDir, packDirs: [packDir] }),
    )
  }),
)

/**
 * A fresh temporary dataset, a fresh temporary work directory, and a review server listening
 * on an ephemeral port of the loopback interface, reached through the platform `HttpClient`.
 */
export const reviewServerFixture: Layer.Layer<
  ReviewFixture | HttpClient.HttpClient | FileSystem.FileSystem | Path.Path
> = Layer.orDie(
  Layer.provideMerge(
    locationsLayer,
    Layer.mergeAll(
      NodeHttpServer.layer(() => createServer(), { host: '127.0.0.1', port: 0 }),
      FetchHttpClient.layer,
    ),
  ),
)
