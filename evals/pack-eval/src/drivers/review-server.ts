import { Array as Arr, Effect, Layer, Option, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import * as HttpRouter from 'effect/unstable/http/HttpRouter'
import * as HttpServer from 'effect/unstable/http/HttpServer'
import type * as HttpServerError from 'effect/unstable/http/HttpServerError'
import * as HttpServerRequest from 'effect/unstable/http/HttpServerRequest'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'
import { assignPairSplits, AssignPairSplitsCommand, PairSplitInput } from '../assign-pair-splits.workflow.js'
import { assignTaskSplit, AssignTaskSplitCommand } from '../assign-task-split.workflow.js'
import { DatasetFileRefusal } from '../dataset-file.schema.js'
import { JudgePrompt } from '../judge-prompt.schema.js'
import { PairLabel, PairLabels, RoutingLabelEntry, RoutingLabels } from '../labels.schema.js'
import { Pack, type PackRule, type RuleFileRefusal } from '../pack-rule.schema.js'
import {
  PairNotGoverning,
  PlantedPairNeedsBody,
  ReviewAccepted,
  ReviewCandidateList,
  ReviewError,
  ReviewLabelsSaved,
  ReviewNotFound,
  ReviewPairList,
  ReviewPairSaved,
  ReviewRejected,
  ReviewSaveLabelsBody,
  ReviewSavePairBody,
  ReviewTaskList,
  ReviewTaskView,
  ReviewWitnessedPair,
  RouteIdParams,
  RoutePackQuery,
  UnknownLabelStem,
} from '../review-api.schema.js'
import { SelectionTrace } from '../selection-trace.schema.js'
import { CandidateTask, CandidateTasks } from '../task-discovery.schema.js'
import type { TaskSplit } from '../task-set.schema.js'
import { Task, TaskSet } from '../task-set.schema.js'
import { readJson, readPack, traceRelativePathOf, writeJson } from './dataset-files.js'

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
  | PairNotGoverning
  | PlantedPairNeedsBody
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
  store.paths.join(store.options.workDir, traceRelativePathOf(packId, taskId))

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

const pairLabelsPathOf = (store: ReviewStore): string => store.paths.join(store.options.datasetDir, 'pair-labels.json')

const judgePromptPathOf = (store: ReviewStore): string =>
  store.paths.join(store.options.datasetDir, 'judge-prompt.json')

const emptyPairLabels = new PairLabels({ version: 1, entries: [] })

const readPairLabels = (store: ReviewStore): Effect.Effect<PairLabels, DatasetFileRefusal, FileSystem.FileSystem> =>
  readDefaulting({ path: pairLabelsPathOf(store), schema: PairLabels, empty: emptyPairLabels })

const readJudgePrompt = (
  store: ReviewStore,
): Effect.Effect<Option.Option<JudgePrompt>, never, FileSystem.FileSystem> =>
  Effect.asSome(readJson(judgePromptPathOf(store), JudgePrompt)).pipe(
    Effect.orElseSucceed((): Option.Option<JudgePrompt> => Option.none()),
  )

const pairIdOf = (packId: string, ruleA: string, ruleB: string): string =>
  [packId, ...[ruleA, ruleB].toSorted()].join(':')

const unorderedStemPairs = (stems: ReadonlyArray<string>): ReadonlyArray<readonly [string, string]> =>
  stems.flatMap((stem, index) => stems.slice(index + 1).map((later): readonly [string, string] => [stem, later]))

const governs = (governing: ReadonlyArray<string>, stem: string): boolean => governing.includes(stem)

const ruleByStem = (pack: Pack, stem: string): PackRule | undefined => pack.rules.find((rule) => rule.stem === stem)

interface WitnessedPairRules {
  readonly first: PackRule
  readonly second: PackRule
}

interface WitnessedPairDetails {
  readonly taskId: string
  readonly taskText: string
  readonly pack: Pack
  readonly pairLabels: PairLabels
  readonly stems: readonly [string, string]
}

const rulesOfPair = (details: WitnessedPairDetails): Option.Option<WitnessedPairRules> =>
  Option.all({
    first: Option.fromUndefinedOr(ruleByStem(details.pack, details.stems[0])),
    second: Option.fromUndefinedOr(ruleByStem(details.pack, details.stems[1])),
  })

const labelOfPair = (details: WitnessedPairDetails): PairLabel | undefined =>
  details.pairLabels.entries.find((entry) => entry.id === pairIdOf(details.pack.id, details.stems[0], details.stems[1]))

interface ShownPairBodies {
  readonly ruleA: { readonly stem: string; readonly title: string; readonly body: string }
  readonly ruleB: { readonly stem: string; readonly title: string; readonly body: string }
}

interface ShownPairState {
  readonly origin: 'observed' | 'planted' | undefined
  readonly split: 'train' | 'dev' | 'test' | undefined
  readonly verdict: 'Pass' | 'Fail' | undefined
  readonly notes: string | undefined
  readonly plantedBody: string | undefined
}

const shownRuleBBody = (label: PairLabel | undefined, realBody: string): string =>
  Option.fromUndefinedOr(label?.plantedBody).pipe(
    Option.filter(() => label?.origin === 'planted'),
    Option.getOrElse(() => realBody),
  )

const bodiesOf = (rules: WitnessedPairRules, label: PairLabel | undefined): ShownPairBodies => ({
  ruleA: { stem: rules.first.stem, title: rules.first.title, body: rules.first.body },
  ruleB: { stem: rules.second.stem, title: rules.second.title, body: shownRuleBBody(label, rules.second.body) },
})

const labelledStateOf = (label: PairLabel): ShownPairState => ({
  origin: label.origin,
  split: label.split,
  verdict: label.verdict,
  notes: label.notes,
  plantedBody: label.plantedBody,
})

const unlabelledState: ShownPairState = {
  origin: undefined,
  split: undefined,
  verdict: undefined,
  notes: undefined,
  plantedBody: undefined,
}

const stateOf = (label: PairLabel | undefined): ShownPairState =>
  Option.fromUndefinedOr(label).pipe(Option.map(labelledStateOf), Option.getOrElse(() => unlabelledState))

const witnessedPairViewOf = (
  details: WitnessedPairDetails,
  rules: WitnessedPairRules,
  label: PairLabel | undefined,
): ReviewWitnessedPair => {
  const bodies = bodiesOf(rules, label)
  const state = stateOf(label)
  return new ReviewWitnessedPair({
    pairId: pairIdOf(details.pack.id, details.stems[0], details.stems[1]),
    taskId: details.taskId,
    taskText: details.taskText,
    packId: details.pack.id,
    ruleA: { ...bodies.ruleA },
    ruleB: { ...bodies.ruleB },
    origin: state.origin,
    split: state.split,
    verdict: state.verdict,
    notes: state.notes,
    plantedBody: state.plantedBody,
  })
}
const witnessedPairOf = (details: WitnessedPairDetails): Option.Option<ReviewWitnessedPair> =>
  Option.map(
    rulesOfPair(details),
    (rules) => witnessedPairViewOf(details, rules, labelOfPair(details)),
  )

const pairsForPack = (
  details: {
    readonly taskId: string
    readonly taskText: string
    readonly pack: Pack
    readonly labels: RoutingLabels
    readonly pairLabels: PairLabels
  },
): ReadonlyArray<ReviewWitnessedPair> =>
  Arr.findFirst(details.labels.entries, (entry) => entry.taskId === details.taskId && entry.packId === details.pack.id)
    .pipe(
      Option.map((entry) =>
        unorderedStemPairs(entry.governing.filter((stem) => ruleByStem(details.pack, stem) !== undefined))
          .map((stems) =>
            witnessedPairOf({
              taskId: details.taskId,
              taskText: details.taskText,
              pack: details.pack,
              pairLabels: details.pairLabels,
              stems,
            })
          )
          .flatMap((pair) => Option.toArray(pair))
      ),
      Option.getOrElse((): ReadonlyArray<ReviewWitnessedPair> => []),
    )

const listPairs = (
  store: ReviewStore,
  taskId: string,
): Effect.Effect<ReviewPairList, ReviewRefusal, ReviewRead> =>
  Effect.gen(function*() {
    const tasks = yield* readTaskSet(store)
    const task = yield* requiredTask(tasks, taskId)
    const packs = yield* readPacks(store)
    const labels = yield* readLabels(store)
    const pairLabels = yield* readPairLabels(store)
    return new ReviewPairList({
      pairs: packs.flatMap((pack) => pairsForPack({ taskId, taskText: task.text, pack, labels, pairLabels })),
    })
  })

const governsBoth = (
  labels: RoutingLabels,
  taskId: string,
  packId: string,
  body: ReviewSavePairBody,
): boolean =>
  Arr.findFirst(labels.entries, (entry) => entry.taskId === taskId && entry.packId === packId).pipe(
    Option.exists((entry) => governs(entry.governing, body.ruleA) && governs(entry.governing, body.ruleB)),
  )

const refuseNotGoverning = (
  details: {
    readonly labels: RoutingLabels
    readonly taskId: string
    readonly packId: string
    readonly body: ReviewSavePairBody
  },
): Effect.Effect<void, PairNotGoverning> =>
  governsBoth(details.labels, details.taskId, details.packId, details.body)
    ? Effect.void
    : Effect.fail(
      new PairNotGoverning({
        taskId: details.taskId,
        packId: details.packId,
        ruleA: details.body.ruleA,
        ruleB: details.body.ruleB,
      }),
    )

const needsPlantedBody = (body: ReviewSavePairBody): boolean =>
  body.origin === 'planted' && body.plantedBody === undefined

const refusePlantedWithoutBody = (
  pairId: string,
  body: ReviewSavePairBody,
): Effect.Effect<void, PlantedPairNeedsBody> =>
  needsPlantedBody(body) ? Effect.fail(new PlantedPairNeedsBody({ pairId })) : Effect.void

const knownSplitOf = (
  assigned: ReadonlyArray<{ readonly pairId: string; readonly split: 'train' | 'dev' | 'test' }>,
  pairId: string,
): 'train' | 'dev' | 'test' | undefined => assigned.find((entry) => entry.pairId === pairId)?.split

const splitFor = (
  assigned: ReadonlyArray<{ readonly pairId: string; readonly split: 'train' | 'dev' | 'test' }>,
  pairId: string,
): 'train' | 'dev' | 'test' =>
  Option.fromUndefinedOr(knownSplitOf(assigned, pairId)).pipe(Option.getOrElse((): 'train' | 'dev' | 'test' => 'dev'))

const storedExceptPair = (stored: PairLabels, pairId: string): ReadonlyArray<PairLabel> =>
  stored.entries.filter((existing) => existing.id !== pairId)

const splitKeptOf = (entry: PairLabel, split: 'train' | 'dev' | 'test'): PairLabel =>
  new PairLabel({
    id: entry.id,
    taskId: entry.taskId,
    packId: entry.packId,
    ruleA: entry.ruleA,
    ruleB: entry.ruleB,
    split,
    verdict: entry.verdict,
    origin: entry.origin,
    notes: entry.notes,
    plantedBody: entry.plantedBody,
  })

const relabelledPairs = (
  stored: PairLabels,
  split: (pairId: string) => 'train' | 'dev' | 'test',
): PairLabels =>
  new PairLabels({ version: 1, entries: stored.entries.map((entry) => splitKeptOf(entry, split(entry.id))) })

const pairEntryOf = (
  taskId: string,
  packId: string,
  pairId: string,
  body: ReviewSavePairBody,
): PairLabel =>
  new PairLabel({
    id: pairId,
    taskId,
    packId,
    ruleA: body.ruleA,
    ruleB: body.ruleB,
    split: 'dev',
    verdict: body.verdict,
    origin: body.origin,
    notes: body.notes,
    plantedBody: body.plantedBody,
  })

const fewShotIdsOf = (prompt: Option.Option<JudgePrompt>): ReadonlyArray<string> =>
  Option.match(prompt, { onNone: () => [], onSome: (found) => [...found.fewShotPairIds] })

const reassignedSplits = (
  upserted: PairLabels,
  prompt: Option.Option<JudgePrompt>,
): ReadonlyArray<{ readonly pairId: string; readonly split: 'train' | 'dev' | 'test' }> =>
  Result.getOrThrow(
    assignPairSplits(
      new AssignPairSplitsCommand({
        pairs: upserted.entries.map((saved) => new PairSplitInput({ pairId: saved.id, verdict: saved.verdict })),
        fewShotPairIds: [...fewShotIdsOf(prompt)],
      }),
    ),
  ).assignments

const savedSplitOf = (rewritten: PairLabels, pairId: string): 'train' | 'dev' | 'test' =>
  Option.fromUndefinedOr(rewritten.entries.find((savedEntry) => savedEntry.id === pairId)?.split).pipe(
    Option.getOrElse((): 'train' | 'dev' | 'test' => 'dev'),
  )

const checkedPairOf = (
  details: {
    readonly store: ReviewStore
    readonly taskId: string
    readonly packId: string
    readonly body: ReviewSavePairBody
  },
): Effect.Effect<
  { readonly pairId: string; readonly upserted: PairLabels; readonly prompt: Option.Option<JudgePrompt> },
  ReviewRefusal,
  ReviewRead
> =>
  Effect.gen(function*() {
    const tasks = yield* readTaskSet(details.store)
    yield* requiredTask(tasks, details.taskId)
    const packs = yield* readPacks(details.store)
    const pack = yield* requiredPack(packs, details.packId)
    yield* requiredStems(pack, details.taskId, details.packId, [details.body.ruleA, details.body.ruleB])
    const labels = yield* readLabels(details.store)
    yield* refuseNotGoverning({ labels, taskId: details.taskId, packId: details.packId, body: details.body })
    const pairId = pairIdOf(details.packId, details.body.ruleA, details.body.ruleB)
    yield* refusePlantedWithoutBody(pairId, details.body)
    const stored = yield* readPairLabels(details.store)
    const prompt = yield* readJudgePrompt(details.store)
    const upserted = new PairLabels({
      version: 1,
      entries: [...storedExceptPair(stored, pairId), pairEntryOf(details.taskId, details.packId, pairId, details.body)],
    })
    return { pairId, upserted, prompt }
  })

const storedPairOf = (
  store: ReviewStore,
  taskId: string,
  packId: string,
  body: ReviewSavePairBody,
  checked: { readonly pairId: string; readonly upserted: PairLabels; readonly prompt: Option.Option<JudgePrompt> },
): Effect.Effect<ReviewPairSaved, ReviewRefusal, ReviewRead> =>
  Effect.gen(function*() {
    const rewritten = relabelledPairs(checked.upserted, (savedId) =>
      splitFor(reassignedSplits(checked.upserted, checked.prompt), savedId))
    yield* writeJson(pairLabelsPathOf(store), PairLabels, rewritten)
    return new ReviewPairSaved({
      pairId: checked.pairId,
      taskId,
      packId,
      split: savedSplitOf(rewritten, checked.pairId),
      verdict: body.verdict,
      origin: body.origin,
    })
  })

const savePair = (
  store: ReviewStore,
  taskId: string,
  packId: string,
  body: ReviewSavePairBody,
): Effect.Effect<ReviewPairSaved, ReviewRefusal, ReviewRead> =>
  Effect.flatMap(
    checkedPairOf({ store, taskId, packId, body }),
    (checked) => storedPairOf(store, taskId, packId, body, checked),
  )

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

const notGoverningResponse = (refusal: PairNotGoverning): HttpServerResponse.HttpServerResponse =>
  errorResponse(422)(
    `the task ${refusal.taskId} does not label both rules as governing: ${refusal.ruleA}, ${refusal.ruleB}`,
  )

const plantedBodyResponse = (refusal: PlantedPairNeedsBody): HttpServerResponse.HttpServerResponse =>
  errorResponse(422)(`a planted pair needs a body: ${refusal.pairId}`)

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
      PairNotGoverning: (refusal: PairNotGoverning) => Effect.succeed(notGoverningResponse(refusal)),
      PlantedPairNeedsBody: (refusal: PlantedPairNeedsBody) => Effect.succeed(plantedBodyResponse(refusal)),
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
const savedLabelsOf = (
  store: ReviewStore,
  taskId: string,
  packId: string,
): Effect.Effect<ReviewLabelsSaved, ReviewRefusal, ReviewRead | HttpServerRequest.HttpServerRequest> =>
  Effect.flatMap(
    HttpServerRequest.schemaBodyJson(ReviewSaveLabelsBody),
    (body) => saveLabels(store, taskId, packId, body),
  )

const packOf: Effect.Effect<
  string,
  Schema.SchemaError,
  HttpServerRequest.ParsedSearchParams | HttpRouter.RouteContext
> = Effect.map(HttpRouter.schemaParams(RoutePackQuery), (params) => params.pack)

const savedPairOf = (
  store: ReviewStore,
  taskId: string,
  packId: string,
): Effect.Effect<ReviewPairSaved, ReviewRefusal, ReviewRead | HttpServerRequest.HttpServerRequest> =>
  Effect.flatMap(
    HttpServerRequest.schemaBodyJson(ReviewSavePairBody),
    (body) => savePair(store, taskId, packId, body),
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
      HttpRouter.route(
        'GET',
        '/api/tasks/:id/pairs',
        settled(Effect.flatMap(idOf, (id) => listPairs(store, id))),
      ),
      HttpRouter.route(
        'PUT',
        '/api/tasks/:id/pairs',
        settled(
          Effect.flatMap(idOf, (id) => Effect.flatMap(packOf, (packId) => savedPairOf(store, id, packId))),
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
