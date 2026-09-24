import { Sandwich } from '@systemfsoftware/effect-cell-types'
import { Array as Arr, Console, Effect, Match, Option, Result, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { AdmitDataset, admitDataset } from './admit-dataset.workflow.js'
import type { AdmitDatasetError } from './admit-dataset.workflow.js'
import { assessJudgeValidity, AssessJudgeValidityCommand, JudgeLabelOutcome } from './assess-judge-validity.workflow.js'
import { bootstrapRateInterval, BootstrapRateIntervalCommand } from './bootstrap-rate-interval.workflow.js'
import type {
  BootstrapRateIntervalError,
  BootstrapRateIntervalNoItems,
  BootstrapRateIntervalRate,
} from './bootstrap-rate-interval.workflow.js'
import { buildJudgeRequests, BuildJudgeRequestsCommand, JudgeTarget } from './build-judge-requests.workflow.js'
import type { JudgeRequestEntry } from './build-judge-requests.workflow.js'
import { ContradictionJudge } from './contradiction-judge.service.js'
import type { ContradictionJudgeShape } from './contradiction-judge.service.js'
import { ContradictionJudgeRequest, JudgedPair, JudgeFailure } from './contradiction-verdict.schema.js'
import { DatasetFileRefusal } from './dataset-file.schema.js'
import { readJson, readPack, writeJson } from './drivers/dataset-files.js'
import { estimateCorrectedRate, EstimateCorrectedRateCommand } from './estimate-corrected-rate.workflow.js'
import type { EstimateCorrectedRateDecision } from './estimate-corrected-rate.workflow.js'
import {
  ContradictionJudged,
  ContradictionNotEvaluated,
  ContradictionRate,
  EvalReport,
  EvidenceFloor,
  FailLabelCounts,
  JudgeValidityReport,
  JudgeValidityUnavailable,
  JudgeValidityUnvalidated,
  JudgeValidityValidated,
  RuleCounts,
  RuleInsufficientEvidence,
  RuleRates,
  RuleRoute,
  RuleScored,
  RuleUnlabelled,
  UnwitnessedPairView,
  WitnessedFailure,
} from './eval-report.schema.js'
import type { ContradictionReport, RuleVerdict, RunOutcome } from './eval-report.schema.js'
import { findWitnessedPairs, FindWitnessedPairsCommand, PackStems } from './find-witnessed-pairs.workflow.js'
import type { PackPairWitness, PairWitness } from './find-witnessed-pairs.workflow.js'
import { JudgePrompt } from './judge-prompt.schema.js'
import { PairLabels, RoutingLabels } from './labels.schema.js'
import type { PairLabel, RoutingLabelEntry } from './labels.schema.js'
import { Pack } from './pack-rule.schema.js'
import type { RuleFileRefusal } from './pack-rule.schema.js'
import {
  ContradictionUnvalidated,
  ContradictionValidated,
  ContradictionValidityRefused,
  resolveRunOutcome,
  ResolveRunOutcomeCommand,
  RunInputRefused,
  RunProviderError,
} from './resolve-run-outcome.workflow.js'
import type { RunFault } from './resolve-run-outcome.workflow.js'
import { RuleSelector } from './rule-selector.service.js'
import { LoadedRuleStems, scoreRuleRouting, ScoreRuleRoutingCommand } from './score-rule-routing.workflow.js'
import type { RoutingScored, RuleRouting } from './score-rule-routing.workflow.js'
import { AnswerCacheFailure } from './selection-trace.schema.js'
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
  readonly judgeModel: string | undefined
  readonly judgeMinimum: number
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
  readonly contradictionReport: ContradictionReport
}

interface AdmittedInputs {
  readonly packs: ReadonlyArray<Pack>
  readonly taskSet: TaskSet
  readonly routingLabels: RoutingLabels
  readonly instruction: SelectorInstruction
  readonly pairLabels: Option.Option<PairLabels>
  readonly judgePrompt: Option.Option<JudgePrompt>
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

const optionalJsonAt = <S extends Schema.Constraint>(
  path: string,
  schema: S,
): Effect.Effect<
  Result.Result<Option.Option<S['Type']>, RunFault>,
  never,
  FileSystem.FileSystem | S['DecodingServices']
> =>
  Effect.flatMap(
    Effect.orElseSucceed(
      Effect.flatMap(FileSystem.FileSystem, (fileSystem) => fileSystem.exists(path)),
      () => false,
    ),
    (here) =>
      here
        ? Effect.map(
          Effect.result(Effect.mapError(readJson(path, schema), datasetFaultOf)),
          (outcome) => Result.map(outcome, Option.some),
        )
        : Effect.succeed(Result.succeed(Option.none<S['Type']>())),
  )

const pairLabelsAt = (
  paths: Path.Path,
  datasetDir: string,
): Effect.Effect<Result.Result<Option.Option<PairLabels>, RunFault>, never, FileSystem.FileSystem> =>
  optionalJsonAt(datasetPathOf(paths, datasetDir, 'pair-labels.json'), PairLabels)

const judgePromptAt = (
  paths: Path.Path,
  datasetDir: string,
): Effect.Effect<Result.Result<Option.Option<JudgePrompt>, RunFault>, never, FileSystem.FileSystem> =>
  optionalJsonAt(datasetPathOf(paths, datasetDir, 'judge-prompt.json'), JudgePrompt)

const firstFaultOf = (
  outcomes: ReadonlyArray<
    | Result.Result<Pack, RunFault>
    | Result.Result<SelectorInstruction, RunFault>
    | Result.Result<TaskSet, RunFault>
    | Result.Result<RoutingLabels, RunFault>
    | Result.Result<Option.Option<PairLabels>, RunFault>
    | Result.Result<Option.Option<JudgePrompt>, RunFault>
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
    const pairLabels = yield* pairLabelsAt(paths, request.datasetDir)
    const judgePrompt = yield* judgePromptAt(paths, request.datasetDir)
    return Option.match(
      firstFaultOf([instruction, taskSet, routingLabels, pairLabels, judgePrompt, ...packs]),
      {
        onSome: (fault) => Result.fail(fault),
        onNone: () =>
          Result.succeed({
            packs: Arr.getSuccesses(packs),
            taskSet: Result.getOrThrow(taskSet),
            routingLabels: Result.getOrThrow(routingLabels),
            instruction: Result.getOrThrow(instruction),
            pairLabels: Result.getOrThrow(pairLabels),
            judgePrompt: Result.getOrThrow(judgePrompt),
          }),
      },
    )
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
  contradictionReport: new ContradictionNotEvaluated(),
})

const reportedRead = (
  request: EvaluatePacksRequest,
  rules: ReadonlyArray<RuleRoute>,
  servedModel: string,
  contradictionReport: ContradictionReport,
): EvaluateRead => ({
  contradiction: Match.value(contradictionReport).pipe(
    Match.tag('ContradictionNotEvaluated', () => new ContradictionNotEvaluated()),
    Match.tag('ContradictionJudged', (judged) =>
      Match.value(judged.judge).pipe(
        Match.tag('JudgeValidityValidated', () =>
          new ContradictionValidated({ witnessedFailures: judged.failures.length })),
        Match.tag('JudgeValidityUnvalidated', () =>
          new ContradictionUnvalidated({ witnessedFailures: judged.failures.length })),
        Match.tag('JudgeValidityUnavailable', (unavailable) =>
          new ContradictionValidityRefused({ reason: unavailable.reason })),
        Match.exhaustive,
      )),
    Match.exhaustive,
  ),
  seed: request.seed,
  iterations: request.iterations,
  confidence: request.confidence,
  evidenceFloor: request.evidenceFloor,
  provider: request.provider,
  reportPath: request.reportPath,
  servedSelectorModel: servedModel,
  rules,
  contradictionReport,
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
): Effect.Effect<EvaluateRead, never, RuleSelector> =>
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
      onFailure: (fault) => Effect.succeed(refusedRead(request, fault)),
      onSuccess: (rules) => scoredContradictionRead(request, admitted, selections, rules),
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
    return yield* Option.match(firstSelectionFaultOf(selections), {
      onSome: (fault) => Effect.succeed(refusedRead(request, fault)),
      onNone: () => scoredRead(request, admitted, selections),
    })
  })

const selectAndScore = (
  request: EvaluatePacksRequest,
  inputs: AdmittedInputs,
): Effect.Effect<EvaluateRead, never, RuleSelector> =>
  Result.match(
    admitDataset(
      new AdmitDataset({
        packs: inputs.packs,
        taskSet: inputs.taskSet,
        routingLabels: inputs.routingLabels,
        pairLabels: Option.getOrUndefined(inputs.pairLabels),
        judgePrompt: Option.getOrUndefined(inputs.judgePrompt),
      }),
    ),
    {
      onFailure: (error) =>
        Effect.succeed(refusedRead(request, new RunInputRefused({ detail: describeAdmitError(error) }))),
      onSuccess: () => contradictionGateRead(request, inputs, selectAndScoreAdmitted),
    },
  )

interface ContradictionGate {
  readonly pairLabels: PairLabels
  readonly judgePrompt: JudgePrompt
}

const hasPairEntries = (inputs: AdmittedInputs): boolean =>
  Option.match(inputs.pairLabels, { onNone: () => false, onSome: (labels) => labels.entries.length > 0 })

const gateOf = (inputs: AdmittedInputs): Option.Option<ContradictionGate> =>
  Option.filter(
    Option.zipWith(inputs.pairLabels, inputs.judgePrompt, (pairLabels, judgePrompt) => ({ pairLabels, judgePrompt })),
    (gate) => gate.pairLabels.entries.length > 0,
  )

const judgePromptMissingRefusal = (): RunFault =>
  new RunInputRefused({ detail: 'pair-labels.json holds entries but judge-prompt.json is missing' })

const promptRefusalOf = (inputs: AdmittedInputs): Option.Option<RunFault> =>
  Option.match(inputs.judgePrompt, {
    onNone: () => Option.some(judgePromptMissingRefusal()),
    onSome: () => Option.none(),
  })

const gateRefusalOf = (
  request: EvaluatePacksRequest,
  inputs: AdmittedInputs,
): Option.Option<RunFault> =>
  Option.match(Option.fromUndefinedOr(request.judgeModel), {
    onNone: () =>
      Option.some(
        new RunInputRefused({
          detail: 'pair-labels.json holds entries but no judge model was given: pass --judge-model',
        }),
      ),
    onSome: () => promptRefusalOf(inputs),
  })

const contradictionGateRead = (
  request: EvaluatePacksRequest,
  inputs: AdmittedInputs,
  scored: (
    scoredRequest: EvaluatePacksRequest,
    scoredInputs: AdmittedInputs,
  ) => Effect.Effect<EvaluateRead, never, RuleSelector>,
): Effect.Effect<EvaluateRead, never, RuleSelector> =>
  hasPairEntries(inputs)
    ? Option.match(gateRefusalOf(request, inputs), {
      onSome: (fault) => Effect.succeed(refusedRead(request, fault)),
      onNone: () => scored(request, inputs),
    })
    : scored(request, inputs)

const validityTargetOf = (label: PairLabel): JudgeTarget =>
  new JudgeTarget({
    id: label.id,
    packId: label.packId,
    taskId: label.taskId,
    ruleA: label.ruleA,
    ruleB: label.ruleB,
    plantedBody: label.plantedBody,
  })

const validityTargetsOf = (gate: ContradictionGate): ReadonlyArray<JudgeTarget> =>
  Arr.map(
    Arr.filter(gate.pairLabels.entries, (entry) => entry.split === 'test'),
    validityTargetOf,
  )

const witnessPackOf = (pack: Pack): PackStems =>
  new PackStems({ packId: pack.id, stems: Arr.map(pack.rules, (rule) => rule.stem) })

const witnessTargetOf = (
  packId: string,
  ruleA: string,
  ruleB: string,
  taskId: string,
): JudgeTarget =>
  new JudgeTarget({
    id: `${packId}:${ruleA}:${ruleB}:${taskId}`,
    packId,
    taskId,
    ruleA,
    ruleB,
  })

const witnessTargetsOfPair = (
  pack: PackPairWitness,
  pair: PairWitness,
): ReadonlyArray<JudgeTarget> =>
  Match.value(pair).pipe(
    Match.tag('WitnessedPair', (witnessed) =>
      Arr.map(witnessed.taskIds, (taskId) =>
        witnessTargetOf(pack.packId, witnessed.ruleA, witnessed.ruleB, taskId))),
    Match.tag('UnwitnessedPair', () => []),
    Match.exhaustive,
  )

const witnessTargetsOf = (packs: ReadonlyArray<PackPairWitness>): ReadonlyArray<JudgeTarget> =>
  Arr.flatMap(packs, (pack) => Arr.flatMap(pack.pairs, (pair) => witnessTargetsOfPair(pack, pair)))

interface JudgedQuestion {
  readonly id: string
  readonly packId: string
  readonly taskId: string
  readonly ruleA: string
  readonly ruleB: string
  readonly judged: JudgedPair
}

const judgedTargetOf = (
  target: JudgeTarget,
  judged: JudgedPair,
): JudgedQuestion => ({
  id: target.id,
  packId: target.packId,
  taskId: target.taskId,
  ruleA: target.ruleA,
  ruleB: target.ruleB,
  judged,
})

const firstFailedOutcomeOf = (
  outcome: Result.Result<JudgedPair, JudgeFailure | AnswerCacheFailure>,
): Option.Option<JudgeFailure | AnswerCacheFailure> =>
  Result.match(outcome, { onFailure: (error) => Option.some(error), onSuccess: () => Option.none() })

const targetFaultOf = (
  target: JudgeTarget,
  error: JudgeFailure | AnswerCacheFailure,
): RunFault =>
  Match.value(error).pipe(
    Match.tag('JudgeFailure', (failure) =>
      new RunProviderError({
        detail: `judge target ${target.id} via ${failure.role} (${failure.model}): ${failure.message}`,
      })),
    Match.tag('AnswerCacheFailure', (failure) =>
      new RunProviderError({
        detail: `judge target ${target.id} via ${failure.operation} answer cache ${failure.source}: ${failure.message}`,
      })),
    Match.exhaustive,
  )

const judgedFaultOf = (
  targets: ReadonlyArray<JudgeTarget>,
  outcomes: ReadonlyArray<Result.Result<JudgedPair, JudgeFailure | AnswerCacheFailure>>,
): Option.Option<RunFault> =>
  Option.flatMap(
    Arr.findFirst(Arr.zip(targets, outcomes), ([, outcome]) => Result.isFailure(outcome)),
    ([target, outcome]) => Option.map(firstFailedOutcomeOf(outcome), (error) => targetFaultOf(target, error)),
  )

const failLabelsOf = (gate: ContradictionGate): FailLabelCounts => {
  const fails = Arr.filter(gate.pairLabels.entries, (entry) => entry.verdict === 'Fail')
  return new FailLabelCounts({
    observed: fails.filter((entry) => entry.origin === 'observed').length,
    planted: fails.filter((entry) => entry.origin === 'planted').length,
  })
}

const unwitnessedViewsOf = (packs: ReadonlyArray<PackPairWitness>): ReadonlyArray<UnwitnessedPairView> =>
  Arr.flatMap(packs, (pack) =>
    Arr.flatMap(pack.pairs, (pair) =>
      Match.value(pair).pipe(
        Match.tag('WitnessedPair', () => []),
        Match.tag('UnwitnessedPair', (unwitnessed) => [
          new UnwitnessedPairView({ packId: pack.packId, ruleA: unwitnessed.ruleA, ruleB: unwitnessed.ruleB }),
        ]),
        Match.exhaustive,
      )))
const targetByIdOf = (
  judged: ReadonlyArray<JudgedQuestion>,
): Readonly<Record<string, JudgedQuestion>> => Object.fromEntries(judged.map((target) => [target.id, target]))

const verdictByIdOf = (judged: ReadonlyArray<JudgedQuestion>): Readonly<Record<string, 'Pass' | 'Fail'>> =>
  Object.fromEntries(judged.map((target) => [target.id, target.judged.verdict]))

const outcomeOf = (
  verdictsById: Readonly<Record<string, 'Pass' | 'Fail'>>,
  label: PairLabel,
): JudgeLabelOutcome =>
  new JudgeLabelOutcome({
    label: label.verdict,
    verdict: Option.getOrThrow(Option.fromUndefinedOr(verdictsById[label.id])),
  })

const labelOutcomesOf = (
  gate: ContradictionGate,
  judged: ReadonlyArray<JudgedQuestion>,
): ReadonlyArray<JudgeLabelOutcome> => {
  const verdictsById = verdictByIdOf(judged)
  return Arr.map(
    Arr.filter(gate.pairLabels.entries, (entry) => entry.split === 'test'),
    (label) => outcomeOf(verdictsById, label),
  )
}

const validatedOf = (validated: {
  readonly tpr: number
  readonly tnr: number
}): JudgeValidityValidated => new JudgeValidityValidated({ tpr: validated.tpr, tnr: validated.tnr })

const unvalidatedOf = (unvalidated: {
  readonly tpr: number
  readonly tnr: number
  readonly short: 'TPR' | 'TNR' | 'both'
}): JudgeValidityUnvalidated =>
  new JudgeValidityUnvalidated({ tpr: unvalidated.tpr, tnr: unvalidated.tnr, short: unvalidated.short })

const unavailableOf = (refused: { readonly reason: string }): JudgeValidityUnavailable =>
  new JudgeValidityUnavailable({ reason: refused.reason })

const judgeValidityOf = (
  request: EvaluatePacksRequest,
  gate: ContradictionGate,
  judged: ReadonlyArray<JudgedQuestion>,
): JudgeValidityReport =>
  Match.value(
    Result.getOrThrow(
      assessJudgeValidity(
        new AssessJudgeValidityCommand({ outcomes: labelOutcomesOf(gate, judged), minimum: request.judgeMinimum }),
      ),
    ),
  ).pipe(
    Match.tag('JudgeValidated', validatedOf),
    Match.tag('JudgeUnvalidated', unvalidatedOf),
    Match.tag('JudgeValidityRefused', unavailableOf),
    Match.exhaustive,
  )

const failureOf = (judged: JudgedQuestion): Option.Option<WitnessedFailure> =>
  judged.judged.verdict === 'Fail'
    ? Option.some(
      new WitnessedFailure({
        packId: judged.packId,
        ruleA: judged.ruleA,
        ruleB: judged.ruleB,
        taskId: judged.taskId,
        critique: judged.judged.critique,
      }),
    )
    : Option.none()

const failuresOf = (
  targets: ReadonlyArray<JudgeTarget>,
  judged: ReadonlyArray<JudgedQuestion>,
): ReadonlyArray<WitnessedFailure> => {
  const witnessed: Readonly<Record<string, true>> = Object.fromEntries(
    targets.filter((target) => target.id.includes(':')).map((target) => [target.id, true]),
  )
  return Arr.getSomes(
    Arr.map(
      Arr.filter(judged, (entry) => witnessed[entry.id] === true),
      failureOf,
    ),
  )
}

const binaryOf = (verdict: 'Pass' | 'Fail'): number => (verdict === 'Pass' ? 1 : 0)

const servedJudgesOf = (judged: ReadonlyArray<JudgedQuestion>): string =>
  Option.getOrElse(
    Arr.head(Arr.map(judged, (target) => target.judged.servedModel)),
    () => 'unknown',
  )

const witnessIdsOf = (targets: ReadonlyArray<JudgeTarget>): Readonly<Record<string, true>> =>
  Object.fromEntries(targets.filter((target) => target.id.includes(':')).map((target) => [target.id, true]))

const witnessedVerdictsOf = (
  targets: ReadonlyArray<JudgeTarget>,
  judged: ReadonlyArray<JudgedQuestion>,
  packId: string,
): ReadonlyArray<number> => {
  const judgedById = targetByIdOf(judged)
  const witness = witnessIdsOf(targets)
  return Arr.getSomes(Arr.map(
    Arr.filter(targets, (target) => target.packId === packId && witness[target.id] === true),
    (target) =>
      Option.map(
        Option.fromUndefinedOr(judgedById[target.id]),
        (entry) => binaryOf(entry.judged.verdict),
      ),
  ))
}

const calibrationOf = (
  gate: ContradictionGate,
  judged: ReadonlyArray<JudgedQuestion>,
): { readonly labels: ReadonlyArray<number>; readonly predictions: ReadonlyArray<number> } => {
  const verdictsById = verdictByIdOf(judged)
  const testLabels = Arr.filter(gate.pairLabels.entries, (entry) => entry.split === 'test')
  return {
    labels: Arr.map(testLabels, (entry) => binaryOf(entry.verdict)),
    predictions: Arr.map(
      testLabels,
      (entry) => binaryOf(Option.getOrThrow(Option.fromUndefinedOr(verdictsById[entry.id]))),
    ),
  }
}

const ratedIntervalOf = (
  request: EvaluatePacksRequest,
  observed: ReadonlyArray<number>,
  estimate: number,
): { readonly lower: number; readonly upper: number } => {
  const decided = Result.getOrThrow(
    bootstrapRateInterval(
      new BootstrapRateIntervalCommand({
        outcomes: [...observed],
        iterations: request.iterations,
        confidence: request.confidence,
        seed: request.seed,
      }),
    ),
  )
  return Match.value(decided).pipe(
    Match.tag('BootstrapRateIntervalRate', (rated) => ({ lower: 1 - rated.upper, upper: 1 - rated.lower })),
    Match.tag('BootstrapRateIntervalNoItems', () => ({ lower: estimate, upper: estimate })),
    Match.exhaustive,
  )
}

const estimatedOf = (
  request: EvaluatePacksRequest,
  gate: ContradictionGate,
  targets: ReadonlyArray<JudgeTarget>,
  judged: ReadonlyArray<JudgedQuestion>,
  packId: string,
  decision: EstimateCorrectedRateDecision,
): Option.Option<ContradictionRate> =>
  Match.value(decision).pipe(
    Match.tag('EstimateCorrectedRateEstimate', (estimated) => {
      const interval = ratedIntervalOf(request, witnessedVerdictsOf(targets, judged, packId), 1 - estimated.estimate)
      return Option.some(
        new ContradictionRate({
          packId,
          estimate: 1 - estimated.estimate,
          lower: interval.lower,
          upper: interval.upper,
        }),
      )
    }),
    Match.tag('EstimateCorrectedRateNoValidSamples', (unsampled) => {
      const estimate = 1 - unsampled.estimate
      return Option.some(new ContradictionRate({ packId, estimate, lower: estimate, upper: estimate }))
    }),
    Match.exhaustive,
  )

const estimatedRateOf = (
  request: EvaluatePacksRequest,
  gate: ContradictionGate,
  targets: ReadonlyArray<JudgeTarget>,
  judged: ReadonlyArray<JudgedQuestion>,
  packId: string,
): Option.Option<ContradictionRate> => {
  const calibration = calibrationOf(gate, judged)
  return Result.match(
    estimateCorrectedRate(
      new EstimateCorrectedRateCommand({
        testLabels: [...calibration.labels],
        testPredictions: [...calibration.predictions],
        unlabeledPredictions: [...witnessedVerdictsOf(targets, judged, packId)],
        iterations: request.iterations,
        confidence: request.confidence,
        seed: request.seed,
      }),
    ),
    {
      onFailure: () => Option.none<ContradictionRate>(),
      onSuccess: (decision) => estimatedOf(request, gate, targets, judged, packId, decision),
    },
  )
}

const ratedPacksOf = (
  request: EvaluatePacksRequest,
  gate: ContradictionGate,
  targets: ReadonlyArray<JudgeTarget>,
  judged: ReadonlyArray<JudgedQuestion>,
  packs: ReadonlyArray<PackPairWitness>,
): ReadonlyArray<ContradictionRate> =>
  Arr.getSomes(
    Arr.map(
      Arr.filter(packs, (pack) => witnessedVerdictsOf(targets, judged, pack.packId).length > 0),
      (pack) => estimatedRateOf(request, gate, targets, judged, pack.packId),
    ),
  )

const ratesOf = (
  request: EvaluatePacksRequest,
  gate: ContradictionGate,
  targets: ReadonlyArray<JudgeTarget>,
  judged: ReadonlyArray<JudgedQuestion>,
  validity: JudgeValidityReport,
  packs: ReadonlyArray<PackPairWitness>,
): ReadonlyArray<ContradictionRate> =>
  Match.value(validity).pipe(
    Match.tag('JudgeValidityValidated', () =>
      ratedPacksOf(request, gate, targets, judged, packs).map((rate) =>
        rate.lower > rate.upper
          ? new ContradictionRate({
            packId: rate.packId,
            estimate: rate.estimate,
            lower: rate.upper,
            upper: rate.lower,
          })
          : rate
      )),
    Match.tag('JudgeValidityUnvalidated', () => []),
    Match.tag('JudgeValidityUnavailable', () => []),
    Match.exhaustive,
  )
const witnessedOf = (
  admitted: AdmittedInputs,
): Result.Result<ReadonlyArray<PackPairWitness>, RunFault> =>
  Match.value(
    Result.getOrThrow(
      findWitnessedPairs(
        new FindWitnessedPairsCommand({
          packs: Arr.map(admitted.packs, witnessPackOf),
          routingLabels: admitted.routingLabels,
        }),
      ),
    ),
  ).pipe(
    Match.tag('WitnessedPairsListed', (listed) => Result.succeed(listed.packs)),
    Match.tag('WitnessedPairsRefused', (refused) => Result.fail(new RunInputRefused({ detail: refused.reason }))),
    Match.exhaustive,
  )

const builtRequestsOf = (
  gate: ContradictionGate,
  admitted: AdmittedInputs,
  targets: ReadonlyArray<JudgeTarget>,
): Result.Result<ReadonlyArray<JudgeRequestEntry>, RunFault> =>
  Result.map(
    Result.mapError(
      buildJudgeRequests(
        new BuildJudgeRequestsCommand({
          packs: [...admitted.packs],
          tasks: admitted.taskSet,
          prompt: gate.judgePrompt,
          pairLabels: gate.pairLabels,
          targets: [...targets],
        }),
      ),
      (error): RunFault =>
        new RunInputRefused({
          detail: Match.value(error).pipe(
            Match.tag(
              'JudgeUnknownTask',
              (refusal) => `judge target ${refusal.id} names task ${refusal.taskId}, which the task set does not hold`,
            ),
            Match.tag(
              'JudgeUnknownStem',
              (refusal) =>
                `judge target ${refusal.id} names rule ${refusal.stem}, which pack ${refusal.packId} does not hold`,
            ),
            Match.tag(
              'JudgeEmptyTaskText',
              (refusal) => `judge target ${refusal.id} names task ${refusal.taskId}, which has no text`,
            ),
            Match.tag(
              'JudgeFewShotPairUnknown',
              (refusal) => `few-shot pair ${refusal.pairId} is not in the pair labels`,
            ),
            Match.tag(
              'JudgeFewShotPairNotInTrain',
              (refusal) => `few-shot pair ${refusal.pairId} is not in the train split`,
            ),
            Match.tag('JudgeFewShotNotesEmpty', (refusal) => `few-shot pair ${refusal.pairId} has no notes`),
            Match.exhaustive,
          ),
        }),
    ),
    (built) => [...built.requests],
  )

const successAt = (
  entry: JudgeRequestEntry,
  index: number,
  outcomes: ReadonlyArray<Result.Result<JudgedPair, JudgeFailure | AnswerCacheFailure>>,
): Option.Option<JudgedQuestion> =>
  Result.match(Option.getOrElse(Option.fromUndefinedOr(outcomes[index]), () => Result.fail(null)), {
    onFailure: () => Option.none<JudgedQuestion>(),
    onSuccess: (judged) =>
      Option.some(
        judgedTargetOf(
          new JudgeTarget({
            id: entry.id,
            packId: entry.request.packId,
            taskId: entry.request.taskId,
            ruleA: entry.request.ruleA.stem,
            ruleB: entry.request.ruleB.stem,
          }),
          judged,
        ),
      ),
  })

const askedTargetsOf = (
  judge: ContradictionJudgeShape,
  entries: ReadonlyArray<JudgeRequestEntry>,
): Effect.Effect<Result.Result<ReadonlyArray<JudgedQuestion>, RunFault>, never> =>
  Effect.gen(function*() {
    const outcomes = yield* Effect.forEach(
      entries,
      (entry) =>
        Effect.result(
          judge.judge(
            new ContradictionJudgeRequest({
              packId: entry.request.packId,
              taskId: entry.request.taskId,
              taskText: entry.request.taskText,
              ruleA: entry.request.ruleA,
              ruleB: entry.request.ruleB,
              prompt: entry.request.prompt,
              fewShot: [...entry.request.fewShot],
            }),
          ),
        ),
    )
    const targets = Arr.map(entries, (entry) => entryTargetOf(entry))
    return Option.match(judgedFaultOf(targets, outcomes), {
      onSome: (fault) => Result.fail(fault),
      onNone: () => Result.succeed(Arr.getSomes(Arr.map(entries, (entry, index) => successAt(entry, index, outcomes)))),
    })
  })

const entryTargetOf = (entry: JudgeRequestEntry): JudgeTarget =>
  new JudgeTarget({
    id: entry.id,
    packId: entry.request.packId,
    taskId: entry.request.taskId,
    ruleA: entry.request.ruleA.stem,
    ruleB: entry.request.ruleB.stem,
  })

const askedJudgedOf = (
  judge: ContradictionJudgeShape,
  entries: ReadonlyArray<JudgeRequestEntry>,
): Effect.Effect<ReadonlyArray<JudgedQuestion>, RunFault> =>
  Effect.flatMap(
    askedTargetsOf(judge, entries),
    (asked) => Result.match(asked, { onFailure: (fault) => Effect.fail(fault), onSuccess: Effect.succeed }),
  )

const unboundJudgeRefusal = (request: EvaluatePacksRequest): RunFault =>
  new RunProviderError({
    detail: `no contradiction judge is bound but judge model ${request.judgeModel ?? 'unknown'} was requested`,
  })

const judgeContradiction = (
  request: EvaluatePacksRequest,
  admitted: AdmittedInputs,
  gate: ContradictionGate,
  judge: Option.Option<ContradictionJudgeShape>,
): Effect.Effect<ContradictionJudged, RunFault> =>
  Effect.gen(function*() {
    const bound = yield* Effect.fromOption(judge, () => unboundJudgeRefusal(request))
    const packs = yield* Result.match(witnessedOf(admitted), {
      onFailure: (fault) => Effect.fail(fault),
      onSuccess: Effect.succeed,
    })
    const targets = [...validityTargetsOf(gate), ...witnessTargetsOf(packs)]
    const entries = yield* Result.match(builtRequestsOf(gate, admitted, targets), {
      onFailure: (fault) => Effect.fail(fault),
      onSuccess: Effect.succeed,
    })
    const judged = yield* askedJudgedOf(bound, entries)
    return judgedReportOf(request, gate, targets, judged, packs)
  })

const judgedReportOf = (
  request: EvaluatePacksRequest,
  gate: ContradictionGate,
  targets: ReadonlyArray<JudgeTarget>,
  judged: ReadonlyArray<JudgedQuestion>,
  packs: ReadonlyArray<PackPairWitness>,
): ContradictionJudged => {
  const validity = judgeValidityOf(request, gate, judged)
  return new ContradictionJudged({
    judge: validity,
    judgeMinimum: request.judgeMinimum,
    servedJudgeModel: servedJudgesOf(judged),
    failures: failuresOf(targets, judged),
    failLabels: failLabelsOf(gate),
    unwitnessedPairs: unwitnessedViewsOf(packs),
    rates: ratesOf(request, gate, targets, judged, validity, packs),
  })
}

const judgedReadOf = (
  request: EvaluatePacksRequest,
  rules: ReadonlyArray<RuleRoute>,
  servedModel: string,
  judged: Effect.Effect<ContradictionJudged, RunFault>,
): Effect.Effect<EvaluateRead, never> =>
  Effect.orElseSucceed(
    Effect.map(judged, (contradiction) => reportedRead(request, rules, servedModel, contradiction)),
    (fault: RunFault) => refusedRead(request, fault),
  )

const scoredContradictionRead = (
  request: EvaluatePacksRequest,
  admitted: AdmittedInputs,
  selections: ReadonlyArray<Result.Result<SelectionTrace, SelectionError>>,
  rules: ReadonlyArray<RuleRoute>,
): Effect.Effect<EvaluateRead, never, RuleSelector> =>
  Option.match(gateOf(admitted), {
    onNone: () =>
      Effect.succeed(reportedRead(request, rules, servedModelOf(selections), new ContradictionNotEvaluated())),
    onSome: (gate) =>
      Effect.flatMap(
        Effect.serviceOption(ContradictionJudge),
        (judge) =>
          judgedReadOf(request, rules, servedModelOf(selections), judgeContradiction(request, admitted, gate, judge)),
      ),
  })

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

const judgeLineOf = (judged: ContradictionJudged): string =>
  Match.value(judged.judge).pipe(
    Match.tag(
      'JudgeValidityValidated',
      (validated) =>
        `- judge: validated · judge model (served): ${judged.servedJudgeModel} · TPR ${
          percentOf(validated.tpr)
        } · TNR ${percentOf(validated.tnr)}`,
    ),
    Match.tag(
      'JudgeValidityUnvalidated',
      (unvalidated) =>
        `- judge: unvalidated (advisory) · TPR ${percentOf(unvalidated.tpr)} · TNR ${
          percentOf(unvalidated.tnr)
        } · ${unvalidated.short} short of the ${judged.judgeMinimum} minimum`,
    ),
    Match.tag(
      'JudgeValidityUnavailable',
      (unavailable) => `- judge: validity refused — ${unavailable.reason}`,
    ),
    Match.exhaustive,
  )

const rateLineOf = (rate: ContradictionRate): string =>
  `- corrected contradiction rate (${rate.packId}): ${percentOf(rate.estimate)} [${percentOf(rate.lower)}, ${
    percentOf(rate.upper)
  }]`

const failureRowOf = (failure: WitnessedFailure): string =>
  `| ${failure.packId} | ${failure.ruleA} × ${failure.ruleB} | ${failure.taskId} | ${failure.critique} |`

const unwitnessedTextOf = (pairs: ReadonlyArray<UnwitnessedPairView>): ReadonlyArray<string> =>
  pairs.length === 0
    ? []
    : [
      `- unwitnessed pairs: ${pairs.map((pair) => `${pair.packId} ${pair.ruleA} × ${pair.ruleB}`).join(', ')}`,
    ]

const contradictionLinesOf = (report: ContradictionReport): ReadonlyArray<string> =>
  Match.value(report).pipe(
    Match.tag('ContradictionNotEvaluated', () => ['- contradiction: not yet evaluated']),
    Match.tag('ContradictionJudged', (judged) => [
      judgeLineOf(judged),
      `- fail labels: ${judged.failLabels.observed} observed · ${judged.failLabels.planted} planted`,
      `- witnessed failures: ${judged.failures.length}`,
      ...Arr.map(judged.rates, rateLineOf),
      ...unwitnessedTextOf(judged.unwitnessedPairs),
    ]),
    Match.exhaustive,
  )

const judgedFailuresOf = (report: ContradictionReport): ReadonlyArray<WitnessedFailure> =>
  Match.value(report).pipe(
    Match.tag('ContradictionNotEvaluated', () => []),
    Match.tag('ContradictionJudged', (judged) => [...judged.failures]),
    Match.exhaustive,
  )

const failureSectionOf = (failures: ReadonlyArray<WitnessedFailure>): ReadonlyArray<string> =>
  failures.length === 0
    ? []
    : [
      '## witnessed failures',
      '',
      '| pack | pair | task | critique |',
      '| --- | --- | --- | --- |',
      ...Arr.map(failures, failureRowOf),
    ]

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
    contradiction: read.contradictionReport,
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
    ...contradictionLinesOf(report.contradiction),
    '',
    ...failureSectionOf(judgedFailuresOf(report.contradiction)),
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
