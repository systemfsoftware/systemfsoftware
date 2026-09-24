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

export const reviewPackId = 'greenhouse'
export const wateringStem = 'watering-schedule'
export const ventingStem = 'night-venting'

export interface ReviewRuleSource {
  readonly stem: string
  readonly title: string
  readonly appliesWhen: ReadonlyArray<string>
  readonly tags: ReadonlyArray<string>
  readonly body: string
}

export const wateringRule: ReviewRuleSource = {
  stem: wateringStem,
  title: 'Water on a schedule',
  appliesWhen: ['touching the watering plan'],
  tags: ['water'],
  body: 'Water every second morning and write the amount in the log.',
}

export const ventingRule: ReviewRuleSource = {
  stem: ventingStem,
  title: 'Keep the air moving at night',
  appliesWhen: ['closing the vents for the night'],
  tags: ['air'],
  body: 'Leave one vent open a hand width after the last walk-through.',
}

export const compostingRule: ReviewRuleSource = {
  stem: 'compost-turning',
  title: 'Turn the heap weekly',
  appliesWhen: ['tending the compost heap'],
  tags: ['soil'],
  body: 'Turn the heap every seventh morning and note the smell.',
}

export const mulchingRule: ReviewRuleSource = {
  stem: 'bed-mulching',
  title: 'Mulch the bare beds',
  appliesWhen: ['covering bare soil'],
  tags: ['soil'],
  body: 'Spread straw two knuckles deep on every bare bed.',
}

export interface ReviewWorld {
  readonly datasetDir: string
  readonly workDir: string
  readonly packId: string
  readonly packDir: string
  readonly baseUrl: string
}

/**
 * The dataset, work directory, and running review server one scenario talks to. The server
 * reads every file per request, so a scenario fills these directories in its own steps.
 */
export class ReviewFixture extends Context.Service<ReviewFixture, ReviewWorld>()(
  '@systemfsoftware/pack-eval/tests/__fixtures__/review-server.fixture/ReviewFixture',
) {}

export interface TextReply {
  readonly status: number
  readonly body: string
}

const boundBaseUrl = (address: NetAddress.InetAddress): string => Result.getOrThrow(NetAddress.toUrl(address)).origin

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

const ruleTextOf = (rule: ReviewRuleSource): string =>
  [
    '---',
    `title: ${rule.title}`,
    `applies_when: [${rule.appliesWhen.join(', ')}]`,
    `tags: [${rule.tags.join(', ')}]`,
    '---',
    '',
    rule.body,
    '',
  ].join('\n')

export const writePackRules = (
  options: { readonly world: ReviewWorld; readonly rules: ReadonlyArray<ReviewRuleSource> },
) =>
  Effect.forEach(options.rules, (rule) =>
    Effect.gen(function*() {
      const fileSystem = yield* FileSystem.FileSystem
      const paths = yield* Path.Path
      const path = paths.join(options.world.packDir, `${rule.stem}.md`)
      yield* fileSystem.writeFileString(path, ruleTextOf(rule))
    }), { discard: true })

export const writeCandidates = (options: {
  readonly world: ReviewWorld
  readonly candidates: PackEval.CandidateTasks
}) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(options.world.workDir, 'candidates.json'),
      PackEval.CandidateTasks,
      options.candidates,
    )
  })

export const writeTaskSet = (options: { readonly world: ReviewWorld; readonly tasks: PackEval.TaskSet }) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(options.world.datasetDir, 'tasks.json'),
      PackEval.TaskSet,
      options.tasks,
    )
  })

export const writeLabels = (options: { readonly world: ReviewWorld; readonly labels: PackEval.RoutingLabels }) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(options.world.datasetDir, 'routing-labels.json'),
      PackEval.RoutingLabels,
      options.labels,
    )
  })

export const writeTrace = (options: {
  readonly world: ReviewWorld
  readonly taskId: string
  readonly loadedStems: ReadonlyArray<string>
}) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    const trace = new PackEval.SelectionTrace({
      taskId: options.taskId,
      packId: options.world.packId,
      loadedStems: [...options.loadedStems],
      requestedModel: 'acme/planner-large',
      servedModel: 'acme/planner-large@acme',
      instructionDigest: 'fixture-instruction-digest',
      rawResponse: '{"loaded":[]}',
    })
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(
        options.world.workDir,
        PackEval.DatasetFiles.traceRelativePathOf(options.world.packId, options.taskId),
      ),
      PackEval.SelectionTrace,
      trace,
    )
  })

export const writePairLabels = (options: {
  readonly world: ReviewWorld
  readonly labels: PackEval.PairLabels
}) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(options.world.datasetDir, 'pair-labels.json'),
      PackEval.PairLabels,
      options.labels,
    )
  })

export const writeJudgePrompt = (options: {
  readonly world: ReviewWorld
  readonly prompt: PackEval.JudgePrompt
}) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    yield* PackEval.DatasetFiles.writeJson(
      paths.join(options.world.datasetDir, 'judge-prompt.json'),
      PackEval.JudgePrompt,
      options.prompt,
    )
  })

export const readPairLabels = (world: ReviewWorld) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    return yield* PackEval.DatasetFiles.readJson(paths.join(world.datasetDir, 'pair-labels.json'), PackEval.PairLabels)
  })

export const pairLabelsFileText = (world: ReviewWorld) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.readFileString(paths.join(world.datasetDir, 'pair-labels.json'))
  })

export const pairLabelsFileExists = (world: ReviewWorld) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.exists(paths.join(world.datasetDir, 'pair-labels.json'))
  })

export const placeOutsideProbe = (options: { readonly base: string; readonly relative: string }) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    yield* fileSystem.makeDirectory(paths.dirname(paths.join(options.base, options.relative)), { recursive: true })
    yield* fileSystem.writeFileString(paths.join(options.base, options.relative), '{"loaded":[]}')
  })

export const outsideProbeExists = (options: { readonly base: string; readonly relative: string }) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.exists(paths.join(options.base, options.relative))
  })

export const readCandidates = (world: ReviewWorld) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    return yield* PackEval.DatasetFiles.readJson(
      paths.join(world.workDir, 'candidates.json'),
      PackEval.CandidateTasks,
    )
  })

export const readTaskSet = (world: ReviewWorld) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    return yield* PackEval.DatasetFiles.readJson(paths.join(world.datasetDir, 'tasks.json'), PackEval.TaskSet)
  })

export const readLabels = (world: ReviewWorld) =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    return yield* PackEval.DatasetFiles.readJson(
      paths.join(world.datasetDir, 'routing-labels.json'),
      PackEval.RoutingLabels,
    )
  })

export const labelsFileText = (world: ReviewWorld) =>
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    return yield* fileSystem.readFileString(paths.join(world.datasetDir, 'routing-labels.json'))
  })

export const readPack = (world: ReviewWorld) => PackEval.DatasetFiles.readPack(world.packDir)

export const textRequest = (options: {
  readonly world: ReviewWorld
  readonly method: 'GET' | 'POST' | 'PUT'
  readonly path: string
  readonly body?: Schema.Json
}): Effect.Effect<TextReply, HttpClientError.HttpClientError, HttpClient.HttpClient> =>
  Effect.gen(function*() {
    const request = HttpClientRequest.make(options.method)(
      new URL(options.path, `${options.world.baseUrl}/`).toString(),
    )
    const withBody = Option.match(Option.fromUndefinedOr(options.body), {
      onNone: () => request,
      onSome: (body) => HttpClientRequest.bodyJsonUnsafe(request, body),
    })
    const response = yield* HttpClient.execute(withBody)
    const body = yield* response.text
    return { status: response.status, body }
  })

const worldLayer = Layer.unwrap(
  Effect.gen(function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const paths = yield* Path.Path
    const base = yield* fileSystem.makeTempDirectoryScoped()
    const datasetDir = paths.join(base, 'dataset')
    const workDir = paths.join(base, 'work')
    const packDir = paths.join(base, 'packs', reviewPackId)
    yield* fileSystem.makeDirectory(datasetDir, { recursive: true })
    yield* fileSystem.makeDirectory(packDir, { recursive: true })
    const server = yield* HttpServer.HttpServer
    if (NetAddress.isUnixPathAddress(server.address)) {
      return yield* Effect.die(new Error('the review server listened on a unix socket'))
    }
    const world: ReviewWorld = {
      datasetDir,
      workDir,
      packId: reviewPackId,
      packDir,
      baseUrl: boundBaseUrl(server.address),
    }
    return Layer.mergeAll(
      Layer.succeed(ReviewFixture, world),
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
    worldLayer,
    Layer.mergeAll(
      NodeHttpServer.layer(() => createServer(), { host: '127.0.0.1', port: 0 }),
      FetchHttpClient.layer,
    ),
  ),
)
