import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Console, Effect, Match, Option, Result } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { AdmitDataset, admitDataset } from './admit-dataset.workflow.js'
import type { AdmitDatasetError } from './admit-dataset.workflow.js'
import { bootstrapRateInterval, BootstrapRateIntervalCommand } from './bootstrap-rate-interval.workflow.js'
import type {
  BootstrapRateIntervalError,
  BootstrapRateIntervalNoItems,
  BootstrapRateIntervalRate,
} from './bootstrap-rate-interval.workflow.js'
import { DatasetFileRefusal } from './dataset-file.schema.js'
import { readJson, readPack, writeJson } from './drivers/dataset-files.js'
import {
  ContradictionNotEvaluated,
  EvalReport,
  EvidenceFloor,
  RuleCounts,
  RuleInsufficientEvidence,
  RuleRates,
  RuleRoute,
  RuleScored,
  RuleUnlabelled,
} from './eval-report.schema.js'
import type { RuleVerdict, RunOutcome } from './eval-report.schema.js'
import { RoutingLabels } from './labels.schema.js'
import type { RoutingLabelEntry } from './labels.schema.js'
import { Pack } from './pack-rule.schema.js'
import type { RuleFileRefusal } from './pack-rule.schema.js'
import {
  resolveRunOutcome,
  ResolveRunOutcomeCommand,
  RunInputRefused,
  RunProviderError,
} from './resolve-run-outcome.workflow.js'
import type { RunFault } from './resolve-run-outcome.workflow.js'
import { RuleSelector } from './rule-selector.service.js'
import { LoadedRuleStems, scoreRuleRouting, ScoreRuleRoutingCommand } from './score-rule-routing.workflow.js'
import type { RoutingScored, RuleRouting } from './score-rule-routing.workflow.js'
import { SelectionTrace } from './selection-trace.schema.js'
import type { SelectionError } from './selection-trace.schema.js'
import { SelectorInstruction } from './selector-instruction.schema.js'
import { TaskSet } from './task-set.schema.js'
import type { Task } from './task-set.schema.js'

export interface EvaluatePacksRequest {
  readonly packDirs: ReadonlyArray<string>
  readonly datasetDir: string
  readonly reportPath: string
  readonly selectorModel: string
  readonly provider: string
  readonly seed: number
  readonly iterations: number
  readonly confidence: number
  readonly evidenceFloor: EvidenceFloor
}

type EvaluateRead = (typeof ResolveRunOutcomeCommand)['Encoded'] & {
  readonly seed: number
  readonly iterations: number
  readonly confidence: number
  readonly evidenceFloor: EvidenceFloor
  readonly provider: string
  readonly reportPath: string
  readonly servedSelectorModel: string
  readonly rules: ReadonlyArray<RuleRoute>
}

interface AdmittedInputs {
  readonly packs: ReadonlyArray<Pack>
  readonly taskSet: TaskSet
  readonly routingLabels: RoutingLabels
  readonly instruction: SelectorInstruction
}

const packFaultOf = (error: DatasetFileRefusal | RuleFileRefusal): RunFault =>
  new RunInputRefused({ detail: `${error.path}: ${error.reason}` })

const datasetFaultOf = (error: DatasetFileRefusal): RunFault =>
  new RunInputRefused({ detail: `${error.path}: ${error.reason}` })

const packRead = (
  dir: string,
): Effect.Effect<Result.Result<Pack, RunFault>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.map(Effect.result(readPack(dir)), (outcome) => Result.mapError(outcome, packFaultOf))

const datasetPathOf = (paths: Path.Path, datasetDir: string, name: string): string => paths.join(datasetDir, name)

const instructionAt = (
  paths: Path.Path,
  datasetDir: string,
): Effect.Effect<Result.Result<SelectorInstruction, RunFault>, never, FileSystem.FileSystem> =>
  Effect.map(
    Effect.result(readJson(datasetPathOf(paths, datasetDir, 'selector-instruction.json'), SelectorInstruction)),
    (outcome) => Result.mapError(outcome, datasetFaultOf),
  )

const taskSetAt = (
  paths: Path.Path,
  datasetDir: string,
): Effect.Effect<Result.Result<TaskSet, RunFault>, never, FileSystem.FileSystem> =>
  Effect.map(
    Effect.result(readJson(datasetPathOf(paths, datasetDir, 'tasks.json'), TaskSet)),
    (outcome) => Result.mapError(outcome, datasetFaultOf),
  )

const routingLabelsAt = (
  paths: Path.Path,
  datasetDir: string,
): Effect.Effect<Result.Result<RoutingLabels, RunFault>, never, FileSystem.FileSystem> =>
  Effect.map(
    Effect.result(readJson(datasetPathOf(paths, datasetDir, 'routing-labels.json'), RoutingLabels)),
    (outcome) => Result.mapError(outcome, datasetFaultOf),
  )

const firstFaultOf = (
  outcomes: ReadonlyArray<
    | Result.Result<Pack, RunFault>
    | Result.Result<SelectorInstruction, RunFault>
    | Result.Result<TaskSet, RunFault>
    | Result.Result<RoutingLabels, RunFault>
  >,
): Option.Option<RunFault> => Arr.head(Arr.getFailures(outcomes))

const gatherInputs = (
  request: EvaluatePacksRequest,
): Effect.Effect<Result.Result<AdmittedInputs, RunFault>, never, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const paths = yield* Path.Path
    const packs = yield* Effect.forEach(request.packDirs, packRead)
    const instruction = yield* instructionAt(paths, request.datasetDir)
    const taskSet = yield* taskSetAt(paths, request.datasetDir)
    const routingLabels = yield* routingLabelsAt(paths, request.datasetDir)
    return Option.match(firstFaultOf([instruction, taskSet, routingLabels, ...packs]), {
      onSome: (fault) => Result.fail(fault),
      onNone: () =>
        Result.succeed({
          packs: Arr.getSuccesses(packs),
          taskSet: Result.getOrThrow(taskSet),
          routingLabels: Result.getOrThrow(routingLabels),
          instruction: Result.getOrThrow(instruction),
        }),
    })
  })

const packOf = (packs: ReadonlyArray<Pack>, packId: string): Option.Option<Pack> =>
  Arr.findFirst(packs, (pack) => pack.id === packId)

const missingStems = (pack: Pack, entry: RoutingLabelEntry): ReadonlyArray<string> =>
  Arr.filter(
    [...entry.governing, ...entry.deferred],
    (stem) => Arr.some(pack.rules, (rule) => rule.stem === stem) === false,
  )

const unknownStemDetailOf = (inputs: AdmittedInputs): ReadonlyArray<string> =>
  Arr.flatMap(inputs.routingLabels.entries, (entry) =>
    Option.match(packOf(inputs.packs, entry.packId), {
      onNone: (): ReadonlyArray<string> => [],
      onSome: (pack) =>
        Arr.map(missingStems(pack, entry), (stem) =>
          `${entry.taskId} names ${stem}, which ${entry.packId} does not hold`),
    }))

const unknownStemFaultOf = (details: ReadonlyArray<string>): Option.Option<RunFault> =>
  Option.map(
    Arr.head(details),
    () => new RunInputRefused({ detail: `labels name rules no pack holds: ${details.join('; ')}` }),
  )

const describeAdmitError = (error: AdmitDatasetError): string =>
  Match.value(error).pipe(
    Match.tag('DuplicateTaskId', (refusal) => `task ${refusal.taskId} appears twice in the task set`),
    Match.tag('DuplicatePairId', (refusal) => `pair ${refusal.pairId} appears twice in the pair labels`),
    Match.tag(
      'UnknownLabelTask',
      (refusal) => `a label names task ${refusal.taskId}, which the task set does not hold`,
    ),
    Match.tag(
      'UnknownLabelPack',
      (refusal) => `a label names pack ${refusal.packId}, which was not given as a pack directory`,
    ),
    Match.tag(
      'UnknownRuleStem',
      (refusal) => `a label names rule ${refusal.stem}, which pack ${refusal.packId} does not hold`,
    ),
    Match.tag(
      'UnknownPairTask',
      (refusal) => `a pair label names task ${refusal.taskId}, which the task set does not hold`,
    ),
    Match.tag(
      'UnknownPairPack',
      (refusal) => `a pair label names pack ${refusal.packId}, which was not given as a pack directory`,
    ),
    Match.tag(
      'PairNotWitnessed',
      (refusal) =>
        `pair ${refusal.pairId} on task ${refusal.taskId} needs no witness: both ${refusal.packId} rules must govern it`,
    ),
    Match.tag('FewShotPairNotInTrain', (refusal) => `few-shot pair ${refusal.pairId} is not in the train split`),
    Match.exhaustive,
  )

const refusedRead = (request: EvaluatePacksRequest, fault: RunFault): EvaluateRead => ({
  contradiction: new ContradictionNotEvaluated(),
  fault,
  seed: request.seed,
  iterations: request.iterations,
  confidence: request.confidence,
  evidenceFloor: request.evidenceFloor,
  provider: request.provider,
  reportPath: request.reportPath,
  servedSelectorModel: 'unknown',
  rules: [],
})

const reportedRead = (
  request: EvaluatePacksRequest,
  rules: ReadonlyArray<RuleRoute>,
  servedModel: string,
): EvaluateRead => ({
  contradiction: new ContradictionNotEvaluated(),
  seed: request.seed,
  iterations: request.iterations,
  confidence: request.confidence,
  evidenceFloor: request.evidenceFloor,
  provider: request.provider,
  reportPath: request.reportPath,
  servedSelectorModel: servedModel,
  rules,
})

interface SelectionPair {
  readonly pack: Pack
  readonly task: Task
}

const pairsOf = (admitted: AdmittedInputs): ReadonlyArray<SelectionPair> =>
  Arr.flatMap(admitted.taskSet.tasks, (task) => Arr.map(admitted.packs, (pack): SelectionPair => ({ pack, task })))

const selectionFaultOf = (error: SelectionError): RunFault =>
  Match.value(error).pipe(
    Match.tag('ProviderFailure', (failure) =>
      new RunProviderError({ detail: `${failure.role} (${failure.model}): ${failure.message}` })),
    Match.tag(
      'UnknownSelectedStem',
      (failure) =>
        new RunProviderError({ detail: `the selector named ${failure.stem}, which ${failure.packId} does not hold` }),
    ),
    Match.tag(
      'AnswerCacheFailure',
      (failure) =>
        new RunProviderError({ detail: `${failure.operation} answer cache ${failure.source}: ${failure.message}` }),
    ),
    Match.exhaustive,
  )

const firstSelectionFaultOf = (
  selections: ReadonlyArray<Result.Result<SelectionTrace, SelectionError>>,
): Option.Option<RunFault> => Option.map(Arr.head(Arr.getFailures(selections)), selectionFaultOf)

const loadedOf = (trace: SelectionTrace): LoadedRuleStems =>
  new LoadedRuleStems({ taskId: trace.taskId, packId: trace.packId, stems: trace.loadedStems })

const servedModelOf = (selections: ReadonlyArray<Result.Result<SelectionTrace, SelectionError>>): string =>
  Option.getOrElse(
    Arr.head(Arr.map(Arr.getSuccesses(selections), (trace) => trace.servedModel)),
    () => 'unknown',
  )

const bootstrapDetailOf = (error: BootstrapRateIntervalError): string =>
  Match.value(error).pipe(
    Match.tag('BootstrapRateIntervalInvalidConfidence', (refusal) =>
      `confidence ${refusal.confidence} is outside (0, 1)`),
    Match.tag('BootstrapRateIntervalZeroIterations', (refusal) =>
      `iterations ${refusal.iterations} is not positive`),
    Match.tag('BootstrapRateIntervalNonBinaryValue', (refusal) => `an outcome was ${refusal.value}, not 0 or 1`),
    Match.exhaustive,
  )

const ratedOf = (
  request: EvaluatePacksRequest,
  outcomes: ReadonlyArray<number>,
): Result.Result<BootstrapRateIntervalRate | BootstrapRateIntervalNoItems, RunFault> =>
  Result.mapError(
    bootstrapRateInterval(
      new BootstrapRateIntervalCommand({
        outcomes,
        iterations: request.iterations,
        confidence: request.confidence,
        seed: request.seed,
      }),
    ),
    (error) => new RunInputRefused({ detail: bootstrapDetailOf(error) }),
  )

const rateOf = (
  rated: BootstrapRateIntervalRate | BootstrapRateIntervalNoItems,
): Option.Option<BootstrapRateIntervalRate> =>
  Match.value(rated).pipe(
    Match.tag('BootstrapRateIntervalRate', (rate) => Option.some(rate)),
    Match.tag('BootstrapRateIntervalNoItems', () => Option.none()),
    Match.exhaustive,
  )

const verdictFromRates = (
  tpr: Option.Option<BootstrapRateIntervalRate>,
  tnr: Option.Option<BootstrapRateIntervalRate>,
): RuleVerdict =>
  Option.match(
    Option.zipWith(tpr, tnr, (positive, negative) =>
      new RuleScored({
        rates: new RuleRates({
          tpr: positive.rate,
          tprLower: positive.lower,
          tprUpper: positive.upper,
          tnr: negative.rate,
          tnrLower: negative.lower,
          tnrUpper: negative.upper,
        }),
      })),
    {
      onNone: () => new RuleInsufficientEvidence(),
      onSome: (verdict) => verdict,
    },
  )

const scoredVerdictOf = (request: EvaluatePacksRequest, scored: RoutingScored): Result.Result<RuleVerdict, RunFault> =>
  Result.flatMap(
    ratedOf(request, scored.positiveOutcomes),
    (tpr) => Result.map(ratedOf(request, scored.negativeOutcomes), (tnr) => verdictFromRates(rateOf(tpr), rateOf(tnr))),
  )

const verdictOf = (request: EvaluatePacksRequest, row: RuleRouting): Result.Result<RuleVerdict, RunFault> =>
  Match.value(row).pipe(
    Match.tag('RoutingUnlabelled', () => Result.succeed(new RuleUnlabelled())),
    Match.tag('RoutingInsufficientEvidence', () => Result.succeed(new RuleInsufficientEvidence())),
    Match.tag('RoutingScored', (scored) => scoredVerdictOf(request, scored)),
    Match.exhaustive,
  )

const routeOf = (row: RuleRouting, verdict: RuleVerdict): RuleRoute =>
  new RuleRoute({
    packId: row.packId,
    stem: row.stem,
    split: row.split,
    counts: new RuleCounts({
      truePositives: row.counts.truePositives,
      falseNegatives: row.counts.falseNegatives,
      falsePositives: row.counts.falsePositives,
      trueNegatives: row.counts.trueNegatives,
    }),
    verdict,
  })

const routesOf = (
  request: EvaluatePacksRequest,
  rows: ReadonlyArray<RuleRouting>,
): Result.Result<ReadonlyArray<RuleRoute>, RunFault> =>
  Result.all(Arr.map(rows, (row) => Result.map(verdictOf(request, row), (verdict) => routeOf(row, verdict))))

const scoredRead = (
  request: EvaluatePacksRequest,
  admitted: AdmittedInputs,
  selections: ReadonlyArray<Result.Result<SelectionTrace, SelectionError>>,
): EvaluateRead =>
  Result.match(
    routesOf(
      request,
      Result.getOrThrow(
        scoreRuleRouting(
          new ScoreRuleRoutingCommand({
            packs: admitted.packs,
            taskSet: admitted.taskSet,
            routingLabels: admitted.routingLabels,
            loaded: Arr.map(Arr.getSuccesses(selections), loadedOf),
            evidenceFloor: request.evidenceFloor,
          }),
        ),
      ),
    ),
    {
      onFailure: (fault) => refusedRead(request, fault),
      onSuccess: (rules) => reportedRead(request, rules, servedModelOf(selections)),
    },
  )

const selectAndScoreAdmitted = (
  request: EvaluatePacksRequest,
  admitted: AdmittedInputs,
): Effect.Effect<EvaluateRead, never, RuleSelector> =>
  Effect.gen(function*() {
    const selector = yield* RuleSelector
    const selections = yield* Effect.forEach(
      pairsOf(admitted),
      (pair) => Effect.result(selector.select({ pack: pair.pack, task: pair.task, instruction: admitted.instruction })),
    )
    return Option.match(firstSelectionFaultOf(selections), {
      onSome: (fault) => refusedRead(request, fault),
      onNone: () => scoredRead(request, admitted, selections),
    })
  })

const selectAndScore = (
  request: EvaluatePacksRequest,
  inputs: AdmittedInputs,
): Effect.Effect<EvaluateRead, never, RuleSelector> =>
  Result.match(
    admitDataset(
      new AdmitDataset({ packs: inputs.packs, taskSet: inputs.taskSet, routingLabels: inputs.routingLabels }),
    ),
    {
      onFailure: (error) =>
        Effect.succeed(refusedRead(request, new RunInputRefused({ detail: describeAdmitError(error) }))),
      onSuccess: () => selectAndScoreAdmitted(request, inputs),
    },
  )

const admittedRead = (
  request: EvaluatePacksRequest,
  inputs: AdmittedInputs,
): Effect.Effect<EvaluateRead, never, RuleSelector> =>
  Option.match(unknownStemFaultOf(unknownStemDetailOf(inputs)), {
    onSome: (fault) => Effect.succeed(refusedRead(request, fault)),
    onNone: () => selectAndScore(request, inputs),
  })

const read = (
  request: EvaluatePacksRequest,
): Effect.Effect<EvaluateRead, never, FileSystem.FileSystem | Path.Path | RuleSelector> =>
  Effect.flatMap(gatherInputs(request), (gathered) =>
    Result.match(gathered, {
      onFailure: (fault) => Effect.succeed(refusedRead(request, fault)),
      onSuccess: (inputs) => admittedRead(request, inputs),
    }))

const outcomeLabelOf = (outcome: RunOutcome): string =>
  Match.value(outcome).pipe(
    Match.when(0, () => 'clean'),
    Match.when(1, () => 'failed on a witnessed contradiction'),
    Match.when(2, () => 'refused'),
    Match.exhaustive,
  )

const percentOf = (rate: number): string => `${(rate * 100).toFixed(1)}%`

const ratesTextOf = (verdict: RuleVerdict): Option.Option<RuleRates> =>
  Match.value(verdict).pipe(
    Match.tag('RuleScored', (scored) => Option.some(scored.rates)),
    Match.tag('RuleInsufficientEvidence', () => Option.none()),
    Match.tag('RuleUnlabelled', () => Option.none()),
    Match.exhaustive,
  )

const intervalTextOf = (rates: Option.Option<RuleRates>): { readonly tpr: string; readonly tnr: string } =>
  Option.match(rates, {
    onNone: () => ({ tpr: '—', tnr: '—' }),
    onSome: (rate) => ({
      tpr: `${percentOf(rate.tpr)} [${percentOf(rate.tprLower)}, ${percentOf(rate.tprUpper)}]`,
      tnr: `${percentOf(rate.tnr)} [${percentOf(rate.tnrLower)}, ${percentOf(rate.tnrUpper)}]`,
    }),
  })

const verdictLabelOf = (verdict: RuleVerdict): string =>
  Match.value(verdict).pipe(
    Match.tag('RuleScored', () => 'scored'),
    Match.tag('RuleInsufficientEvidence', () => 'insufficient-evidence'),
    Match.tag('RuleUnlabelled', () => 'unlabelled'),
    Match.exhaustive,
  )

const rowTextOf = (route: RuleRoute): string => {
  const intervals = intervalTextOf(ratesTextOf(route.verdict))
  return `| ${route.packId} | ${route.stem} | ${route.split} | ${route.counts.truePositives} | ${route.counts.falseNegatives} | ${route.counts.falsePositives} | ${route.counts.trueNegatives} | ${intervals.tpr} | ${intervals.tnr} | ${
    verdictLabelOf(route.verdict)
  } |`
}

const reportOf = (outcome: RunOutcome, read: EvaluateRead, refusal?: string): EvalReport =>
  new EvalReport({
    schemaVersion: 1,
    seed: read.seed,
    iterations: read.iterations,
    confidence: read.confidence,
    evidenceFloor: read.evidenceFloor,
    provider: read.provider,
    servedSelectorModel: read.servedSelectorModel,
    rules: read.rules,
    contradiction: new ContradictionNotEvaluated(),
    outcome,
    ...(refusal === undefined ? {} : { refusal }),
  })

const cardOf = (report: EvalReport): string =>
  [
    '# pack-eval routing',
    '',
    `- provider: ${report.provider}`,
    `- selector model (served): ${report.servedSelectorModel}`,
    `- seed ${report.seed} · ${report.iterations} iterations · 95% intervals · evidence floor ${report.evidenceFloor.positives}/${report.evidenceFloor.negatives}`,
    `- outcome: ${outcomeLabelOf(report.outcome)} (exit ${report.outcome})`,
    ...Option.match(Option.fromUndefinedOr(report.refusal), {
      onNone: () => [],
      onSome: (why) => [`- refused: ${why}`],
    }),
    '- contradiction: not yet evaluated',
    '',
    '## routing',
    '',
    '| pack | rule | split | TP | FN | FP | TN | TPR | TNR | verdict |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...Arr.map(report.rules, rowTextOf),
  ].join('\n')

const emit = (
  outcome: RunOutcome,
  read: EvaluateRead,
  refusal?: string,
): Effect.Effect<number, DatasetFileRefusal, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*() {
    const report = reportOf(outcome, read, refusal)
    yield* writeJson(read.reportPath, EvalReport, report)
    yield* Console.log(cardOf(report))
    return outcome
  })

export const run = Sandwich.named('pack-eval.evaluate')((request: EvaluatePacksRequest) => read(request))
  .decide(resolveRunOutcome)
  .write({
    RunNotYetEvaluated: (value, read) => emit(value.outcome, read),
    RunFailedOnWitnessedContradiction: (value, read) => emit(value.outcome, read),
    RunCleanUnderValidatedJudge: (value, read) => emit(value.outcome, read),
    RunCleanUnderUnvalidatedJudge: (value, read) => emit(value.outcome, read),
    RunCleanUnderRefusedValidity: (value, read) => emit(value.outcome, read),
    RunRefused: (value, read) => emit(value.outcome, read, value.fault.detail),
    CommandRejected: (rejected) =>
      Effect.fail(new DatasetFileRefusal({ path: 'the evaluation inputs', reason: rejected.issue })),
  })
