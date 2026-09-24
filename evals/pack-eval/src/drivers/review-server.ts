import { Array as Arr, Effect, Layer, Option, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'
import * as HttpServer from 'effect/unstable/http/HttpServer'
import type * as HttpServerError from 'effect/unstable/http/HttpServerError'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'
import { assignTaskSplit, AssignTaskSplitCommand } from '../assign-task-split.workflow.js'
import { DatasetFileRefusal } from '../dataset-file.schema.js'
import { RoutingLabelEntry, RoutingLabels } from '../labels.schema.js'
import type { Pack, PackRule, RuleFileRefusal } from '../pack-rule.schema.js'
import {
  ReviewAccepted,
  ReviewCandidateList,
  ReviewError,
  ReviewLabelsSaved,
  ReviewNotFound,
  ReviewRejected,
  ReviewSaveLabelsBody,
  ReviewTaskList,
  ReviewTaskView,
  RouteIdParams,
  RoutePackQuery,
  UnknownLabelStem,
} from '../review-api.schema.js'
import { SelectionTrace } from '../selection-trace.schema.js'
import { CandidateTask, CandidateTasks } from '../task-discovery.schema.js'
import type { TaskSplit } from '../task-set.schema.js'
import { Task, TaskSet } from '../task-set.schema.js'
import { readJson, readPack, writeJson } from './dataset-files.js'

export interface ReviewServerOptions {
  readonly datasetDir: string
  readonly workDir: string
  readonly packDirs: ReadonlyArray<string>
}
type ReviewRefusal =
  | DatasetFileRefusal
  | RuleFileRefusal
  | UnknownLabelStem
  | ReviewNotFound
  | Schema.SchemaError
  | HttpServerError.HttpServerError

type ReviewRead = FileSystem.FileSystem | Path.Path

interface ReviewStore {
  readonly options: ReviewServerOptions
  readonly paths: Path.Path
}

const storeOf = (options: ReviewServerOptions) => Effect.map(Path.Path, (paths): ReviewStore => ({ options, paths }))

const candidatesPathOf = (store: ReviewStore): string => store.paths.join(store.options.workDir, 'candidates.json')

const tasksPathOf = (store: ReviewStore): string => store.paths.join(store.options.datasetDir, 'tasks.json')

const labelsPathOf = (store: ReviewStore): string => store.paths.join(store.options.datasetDir, 'routing-labels.json')

const tracePathOf = (store: ReviewStore, packId: string, taskId: string): string =>
  store.paths.join(store.options.workDir, 'traces', packId, `${taskId}.json`)

const absentTokens = ['ENOENT', 'NotFound']

const isAbsent = (reason: string): boolean => absentTokens.some((token) => reason.includes(token))

const readDefaulting = <S extends Schema.Constraint>(
  details: { readonly path: string; readonly schema: S; readonly empty: S['Type'] },
): Effect.Effect<S['Type'], DatasetFileRefusal, FileSystem.FileSystem | S['DecodingServices']> =>
  readJson(details.path, details.schema).pipe(
    Effect.catchTag(
      'DatasetFileRefusal',
      (refusal) => isAbsent(refusal.reason) ? Effect.succeed(details.empty) : Effect.fail(refusal),
    ),
  )

const emptyCandidates = new CandidateTasks({ version: 1, candidates: [] })

const emptyTaskSet = new TaskSet({ version: 1, tasks: [] })

const emptyLabels = new RoutingLabels({ version: 1, entries: [] })

const readCandidates = (store: ReviewStore): Effect.Effect<CandidateTasks, DatasetFileRefusal, FileSystem.FileSystem> =>
  readDefaulting({ path: candidatesPathOf(store), schema: CandidateTasks, empty: emptyCandidates })

const readTaskSet = (store: ReviewStore): Effect.Effect<TaskSet, DatasetFileRefusal, FileSystem.FileSystem> =>
  readDefaulting({ path: tasksPathOf(store), schema: TaskSet, empty: emptyTaskSet })

const readLabels = (store: ReviewStore): Effect.Effect<RoutingLabels, DatasetFileRefusal, FileSystem.FileSystem> =>
  readDefaulting({ path: labelsPathOf(store), schema: RoutingLabels, empty: emptyLabels })

const readPacks = (
  store: ReviewStore,
): Effect.Effect<ReadonlyArray<Pack>, DatasetFileRefusal | RuleFileRefusal, FileSystem.FileSystem | Path.Path> =>
  Effect.forEach(store.options.packDirs, (dir) => readPack(dir))

/**
 * A trace file carries the selector's answer for one task and pack, and a corrupt trace hides
 * rather than shows: the page may not present selector output it cannot read, so an unreadable
 * trace is answered as no trace at all.
 */
const readTrace = (
  store: ReviewStore,
  packId: string,
  taskId: string,
): Effect.Effect<Option.Option<SelectionTrace>, never, FileSystem.FileSystem> =>
  Effect.asSome(readJson(tracePathOf(store, packId, taskId), SelectionTrace)).pipe(
    Effect.orElseSucceed((): Option.Option<SelectionTrace> => Option.none()),
  )

const candidateListOf = (candidates: CandidateTasks): ReviewCandidateList =>
  new ReviewCandidateList({
    candidates: candidates.candidates.map((candidate) => ({
      id: candidate.id,
      text: candidate.text,
      dimensions: candidate.dimensions,
    })),
  })

const taskListOf = (tasks: TaskSet): ReviewTaskList =>
  new ReviewTaskList({
    tasks: tasks.tasks.map((task) => ({ taskId: task.id, text: task.text, split: task.split })),
  })

const listCandidates = (
  store: ReviewStore,
): Effect.Effect<ReviewCandidateList, ReviewRefusal, ReviewRead> => Effect.map(readCandidates(store), candidateListOf)

const listTasks = (store: ReviewStore): Effect.Effect<ReviewTaskList, ReviewRefusal, ReviewRead> =>
  Effect.map(readTaskSet(store), taskListOf)

const splitOf = (tasks: TaskSet): TaskSplit =>
  Result.getOrThrow(
    assignTaskSplit(
      new AssignTaskSplitCommand({
        devTasks: tasks.tasks.filter((task) => task.split === 'dev').length,
        testTasks: tasks.tasks.filter((task) => task.split === 'test').length,
      }),
    ),
  ).split

const candidateById = (candidates: CandidateTasks, id: string): Option.Option<CandidateTask> =>
  Arr.findFirst(candidates.candidates, (entry) => entry.id === id)

const taskById = (tasks: TaskSet, id: string): Option.Option<Task> =>
  Arr.findFirst(tasks.tasks, (entry) => entry.id === id)

const packById = (packs: ReadonlyArray<Pack>, id: string): Option.Option<Pack> =>
  Arr.findFirst(packs, (entry) => entry.id === id)

const requiredCandidate = (
  candidates: CandidateTasks,
  id: string,
): Effect.Effect<CandidateTask, ReviewNotFound> =>
  Effect.fromOption(candidateById(candidates, id), () => new ReviewNotFound({ what: 'candidate', id }))

const requiredTask = (tasks: TaskSet, id: string): Effect.Effect<Task, ReviewNotFound> =>
  Effect.fromOption(taskById(tasks, id), () => new ReviewNotFound({ what: 'task', id }))

const requiredPack = (packs: ReadonlyArray<Pack>, id: string): Effect.Effect<Pack, ReviewNotFound> =>
  Effect.fromOption(packById(packs, id), () => new ReviewNotFound({ what: 'pack', id }))

const storedCandidates = (candidates: CandidateTasks, id: string): CandidateTasks =>
  new CandidateTasks({
    version: 1,
    candidates: candidates.candidates.filter((entry) => entry.id !== id),
  })

const acceptedTask = (candidate: CandidateTask, split: TaskSplit): Task =>
  new Task({ id: candidate.id, text: candidate.text, split, dimensions: candidate.dimensions })

const acceptCandidate = (
  store: ReviewStore,
  id: string,
): Effect.Effect<ReviewAccepted, ReviewRefusal, ReviewRead> =>
  Effect.gen(function*() {
    const candidates = yield* readCandidates(store)
    const candidate = yield* requiredCandidate(candidates, id)
    const tasks = yield* readTaskSet(store)
    const task = acceptedTask(candidate, splitOf(tasks))
    yield* writeJson(candidatesPathOf(store), CandidateTasks, storedCandidates(candidates, id))
    yield* writeJson(tasksPathOf(store), TaskSet, new TaskSet({ version: 1, tasks: [...tasks.tasks, task] }))
    return new ReviewAccepted({ taskId: task.id, split: task.split })
  })

const rejectCandidate = (
  store: ReviewStore,
  id: string,
): Effect.Effect<ReviewRejected, ReviewRefusal, ReviewRead> =>
  Effect.gen(function*() {
    const candidates = yield* readCandidates(store)
    yield* requiredCandidate(candidates, id)
    yield* writeJson(candidatesPathOf(store), CandidateTasks, storedCandidates(candidates, id))
    return new ReviewRejected({ taskId: id })
  })

const entryOf = (
  labels: RoutingLabels,
  taskId: string,
  packId: string,
): Option.Option<RoutingLabelEntry> =>
  Arr.findFirst(labels.entries, (entry) => entry.taskId === taskId && entry.packId === packId)

const unknownStemIn = (
  pack: Pack,
  taskId: string,
  packId: string,
  stems: ReadonlyArray<string>,
): Option.Option<UnknownLabelStem> =>
  Option.map(
    Arr.findFirst(stems, (stem) => !pack.rules.some((rule) => rule.stem === stem)),
    (stem) => new UnknownLabelStem({ taskId, packId, stem }),
  )

const refuseStem = (refusal: UnknownLabelStem): Effect.Effect<void, UnknownLabelStem> => Effect.fail(refusal)

const checkRefusal = (
  found: Option.Option<UnknownLabelStem>,
): Effect.Effect<void, UnknownLabelStem> => Option.isSome(found) ? refuseStem(found.value) : Effect.void

const requiredStems = (
  pack: Pack,
  taskId: string,
  packId: string,
  stems: ReadonlyArray<string>,
): Effect.Effect<void, UnknownLabelStem> => checkRefusal(unknownStemIn(pack, taskId, packId, stems))

const sameEntry = (entry: RoutingLabelEntry) => (existing: RoutingLabelEntry): boolean =>
  existing.taskId === entry.taskId && existing.packId === entry.packId

const storedExcept = (
  labels: RoutingLabels,
  entry: RoutingLabelEntry,
): ReadonlyArray<RoutingLabelEntry> => labels.entries.filter((existing) => !sameEntry(entry)(existing))

const storedLabels = (labels: RoutingLabels, entry: RoutingLabelEntry): RoutingLabels =>
  new RoutingLabels({ version: 1, entries: [...storedExcept(labels, entry), entry] })

const saveLabels = (
  store: ReviewStore,
  taskId: string,
  packId: string,
  body: ReviewSaveLabelsBody,
): Effect.Effect<ReviewLabelsSaved, ReviewRefusal, ReviewRead> =>
  Effect.gen(function*() {
    const tasks = yield* readTaskSet(store)
    yield* requiredTask(tasks, taskId)
    const packs = yield* readPacks(store)
    const pack = yield* requiredPack(packs, packId)
    yield* requiredStems(pack, taskId, packId, [...body.governing, ...body.deferred])
    const labels = yield* readLabels(store)
    const entry = new RoutingLabelEntry({
      taskId,
      packId,
      governing: [...body.governing],
      deferred: [...body.deferred],
    })
    yield* writeJson(labelsPathOf(store), RoutingLabels, storedLabels(labels, entry))
    return new ReviewLabelsSaved({ taskId, packId })
  })

const ruleDetailsOf = (
  rule: PackRule,
): {
  readonly stem: string
  readonly title: string
  readonly appliesWhen: ReadonlyArray<string>
  readonly body: string
} => ({
  stem: rule.stem,
  title: rule.title,
  appliesWhen: [...rule.appliesWhen],
  body: rule.body,
})

const governingOf = (entry: Option.Option<RoutingLabelEntry>): ReadonlyArray<string> =>
  Option.match(entry, { onNone: () => [], onSome: (found) => [...found.governing] })

const deferredOf = (entry: Option.Option<RoutingLabelEntry>): ReadonlyArray<string> =>
  Option.match(entry, { onNone: () => [], onSome: (found) => [...found.deferred] })

const disclosedStemsOf = (
  entry: Option.Option<RoutingLabelEntry>,
  trace: Option.Option<SelectionTrace>,
): ReadonlyArray<string> | undefined =>
  Option.isSome(entry) ? Option.getOrElse(Option.map(trace, (found) => [...found.loadedStems]), () => []) : undefined

const packViewOf = (
  store: ReviewStore,
  taskId: string,
  labels: RoutingLabels,
) =>
(pack: Pack) =>
  Effect.gen(function*() {
    const entry = entryOf(labels, taskId, pack.id)
    const absent = (): Effect.Effect<Option.Option<SelectionTrace>, never, never> => Effect.succeedNone
    const trace = yield* Option.match(entry, { onNone: absent, onSome: () => readTrace(store, pack.id, taskId) })
    return {
      packId: pack.id,
      rules: pack.rules.map(ruleDetailsOf),
      governing: governingOf(entry),
      deferred: deferredOf(entry),
      traceLoadedStems: disclosedStemsOf(entry, trace),
    }
  })

const taskViewOf = (
  store: ReviewStore,
  taskId: string,
): Effect.Effect<ReviewTaskView, ReviewRefusal, ReviewRead> =>
  Effect.gen(function*() {
    const tasks = yield* readTaskSet(store)
    const task = yield* requiredTask(tasks, taskId)
    const packs = yield* readPacks(store)
    const labels = yield* readLabels(store)
    return new ReviewTaskView({
      taskId: task.id,
      text: task.text,
      packs: yield* Effect.forEach(packs, packViewOf(store, taskId, labels)),
    })
  })

const errorResponse = (status: number) => (message: string): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.setStatus(
    HttpServerResponse.text(JSON.stringify(new ReviewError({ error: message })), {
      contentType: 'application/json',
    }),
    status,
  )

const unknownStemResponse = (refusal: UnknownLabelStem): HttpServerResponse.HttpServerResponse =>
  errorResponse(422)(`unknown stem ${refusal.stem}`)

const notFoundResponse = (refusal: ReviewNotFound): HttpServerResponse.HttpServerResponse =>
  errorResponse(404)(`unknown ${refusal.what} ${refusal.id}`)

const fileRefusalResponse = (
  refusal: DatasetFileRefusal | RuleFileRefusal,
): HttpServerResponse.HttpServerResponse => errorResponse(500)(refusal.reason)

const unreadableResponse = (): HttpServerResponse.HttpServerResponse =>
  errorResponse(400)('the request could not be read')

type RouteRead =
  | ReviewRead
  | HttpServerRequest.HttpServerRequest
  | HttpRouter.RouteContext
  | HttpServerRequest.ParsedSearchParams

const settled = <A, R extends RouteRead>(
  effect: Effect.Effect<A, ReviewRefusal, R>,
): Effect.Effect<HttpServerResponse.HttpServerResponse, never, R> =>
  effect.pipe(
    Effect.catchTags({
      UnknownLabelStem: (refusal: UnknownLabelStem) => Effect.succeed(unknownStemResponse(refusal)),
      ReviewNotFound: (refusal: ReviewNotFound) => Effect.succeed(notFoundResponse(refusal)),
      DatasetFileRefusal: (refusal: DatasetFileRefusal) => Effect.succeed(fileRefusalResponse(refusal)),
      RuleFileRefusal: (refusal: RuleFileRefusal) => Effect.succeed(fileRefusalResponse(refusal)),
      SchemaError: () => Effect.succeed(unreadableResponse()),
      HttpServerError: () => Effect.succeed(unreadableResponse()),
    }),
    Effect.map((value) => HttpServerResponse.text(JSON.stringify(value), { contentType: 'application/json' })),
  )

const reviewPageUrl = new URL('./review-page.html', import.meta.url)

const missingPage = HttpServerResponse.setStatus(
  HttpServerResponse.jsonUnsafe(new ReviewError({ error: 'the review page is missing from the bundle' })),
  500,
)

const servePage: Effect.Effect<HttpServerResponse.HttpServerResponse, never, FileSystem.FileSystem> = Effect.gen(
  function*() {
    const fileSystem = yield* FileSystem.FileSystem
    const page = yield* fileSystem.readFileString(reviewPageUrl.pathname)
    return HttpServerResponse.text(page, { contentType: 'text/html; charset=utf-8' })
  },
).pipe(Effect.orElseSucceed(() => missingPage))

const idOf: Effect.Effect<string, Schema.SchemaError, HttpRouter.RouteContext> = Effect.map(
  HttpRouter.schemaPathParams(RouteIdParams),
  (params) => params.id,
)

const packOf: Effect.Effect<
  string,
  Schema.SchemaError,
  HttpServerRequest.ParsedSearchParams | HttpRouter.RouteContext
> = Effect.map(HttpRouter.schemaParams(RoutePackQuery), (params) => params.pack)

const savedLabelsOf = (
  store: ReviewStore,
  taskId: string,
  packId: string,
): Effect.Effect<ReviewLabelsSaved, ReviewRefusal, ReviewRead | HttpServerRequest.HttpServerRequest> =>
  Effect.flatMap(
    HttpServerRequest.schemaBodyJson(ReviewSaveLabelsBody),
    (body) => saveLabels(store, taskId, packId, body),
  )

const routesOf = (store: ReviewStore) =>
  HttpRouter.use((router) =>
    router.addAll([
      HttpRouter.route('GET', '/', servePage),
      HttpRouter.route('GET', '/api/candidates', settled(listCandidates(store))),
      HttpRouter.route('GET', '/api/tasks', settled(listTasks(store))),
      HttpRouter.route(
        'POST',
        '/api/candidates/:id/accept',
        settled(Effect.flatMap(idOf, (id) => acceptCandidate(store, id))),
      ),
      HttpRouter.route(
        'POST',
        '/api/candidates/:id/reject',
        settled(Effect.flatMap(idOf, (id) => rejectCandidate(store, id))),
      ),
      HttpRouter.route(
        'GET',
        '/api/tasks/:id',
        settled(Effect.flatMap(idOf, (id) => taskViewOf(store, id))),
      ),
      HttpRouter.route(
        'PUT',
        '/api/tasks/:id/labels',
        settled(
          Effect.flatMap(idOf, (id) => Effect.flatMap(packOf, (packId) => savedLabelsOf(store, id, packId))),
        ),
      ),
    ])
  )

const appOf = (options: ReviewServerOptions) => Layer.unwrap(Effect.map(storeOf(options), (store) => routesOf(store)))

/**
 * Serve the review page and JSON API over one dataset directory and one work directory.
 * Requires an `HttpServer` (bound by the caller, e.g. `NodeHttpServer.layer(createServer,
 * { host: '127.0.0.1', port })` in `src/main.ts`), the file system, and paths.
 */
export const layer = (
  options: ReviewServerOptions,
): Layer.Layer<never, never, HttpServer.HttpServer | FileSystem.FileSystem | Path.Path> =>
  HttpRouter.serve(appOf(options), { disableLogger: true, disableListenLog: true })
