import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'

import type { LogEntry } from '../engine/engine.schema.js'
import type { ArtifactRef, RanAttempt } from '../report/report.schema.js'
import { evidenceLineOf, logLineOf } from '../verdict/classify.js'
import type { FailureRecord } from '../verdict/failure.schema.js'
import type {
  ActionRecord,
  CacheLookup,
  StepCacheInfo,
  StepOutcome,
  StepRecord,
} from '../verdict/step-record.schema.js'
import { fileNameOf } from './artifact.schema.js'
import type { AttemptTest } from './attempt.js'

/** The screen as the try left it; each part is present, or says why it is missing. */
export interface ScreenSnapshot {
  readonly text: Result.Result<string, string>
  readonly screenshot: Result.Result<Uint8Array, string>
  readonly logs: Result.Result<ReadonlyArray<LogEntry>, string>
}

export interface TracePageRequest {
  readonly test: AttemptTest
  readonly target: string
  readonly agent: string
  readonly attempt: RanAttempt
  readonly screen: ScreenSnapshot
  readonly artifacts: ReadonlyArray<ArtifactRef>
}

const outcomeOf = (outcome: StepOutcome): string =>
  Match.valueTags(outcome, {
    Passed: () => 'passed',
    Skipped: ({ reason }) => `skipped: ${reason}`,
    Inconclusive: ({ code }) => `inconclusive \`${code}\``,
    Failed: ({ code, cause }) => `failed \`${code}\` (${cause})`,
  })

const lookupOf = (lookup: CacheLookup): string =>
  Match.valueTags(lookup, {
    Replayed: () => 'replayed',
    HandedOff: ({ reason }) => `handed off (${reason})`,
    Missed: () => 'missed',
    Off: () => 'off',
  })

const sourceOf = (lookup: CacheLookup): string =>
  Match.valueTags(lookup, {
    Replayed: () => 'replay',
    HandedOff: () => 'model',
    Missed: () => 'model',
    Off: () => 'model',
  })

interface ModelFacts {
  readonly cache: StepCacheInfo
  readonly modelCalls: number
  readonly tokens: { readonly input: number; readonly output: number }
}

const modelFactsOf = (step: ModelFacts): ReadonlyArray<string> => [
  `- Source: ${sourceOf(step.cache.lookup)}`,
  `- Cache: ${lookupOf(step.cache.lookup)}, write ${step.cache.write}`,
  `- Model calls: ${step.modelCalls}, tokens ${step.tokens.input} in / ${step.tokens.output} out`,
]

const actionLineOf = (record: ActionRecord): string =>
  `  - \`${JSON.stringify(record.action)}\` on ${
    Arr.match(record.located, {
      onEmpty: () => 'no located control',
      onNonEmpty: (located) => located.map((ref) => `${ref.id}@${ref.revision}`).join(', '),
    })
  }`

const detailsOf = (step: StepRecord): ReadonlyArray<string> =>
  Match.valueTags(step, {
    ActStep: (act) => [
      `- Instruction: ${act.instruction}`,
      ...modelFactsOf(act),
      `- Summary: ${act.summary}`,
      '- Actions:',
      ...Arr.map(act.actions, actionLineOf),
    ],
    AssertStep: (judged) => [`- Statement: ${judged.record.sentence}`, ...modelFactsOf(judged)],
    WaitForStep: (judged) => [`- Condition: ${judged.record.sentence}`, ...modelFactsOf(judged)],
    ExtractStep: (extracted) => [`- Schema: ${extracted.schemaId}`, ...modelFactsOf(extracted)],
    LocatorStep: (checked) => [
      '- Source: engine',
      `- ${checked.matcher}: expected ${checked.expected}, observed ${checked.observed}`,
    ],
    ValueStep: (checked) => [
      '- Source: engine',
      `- ${checked.matcher}: expected ${checked.expected}, observed ${checked.observed}`,
    ],
  })

const failureBlockOf = (failure: Pick<FailureRecord, 'evidence' | 'proposed'>): ReadonlyArray<string> => [
  '- Evidence:',
  ...Arr.map(failure.evidence, (ref) => `  ${evidenceLineOf(ref)}`),
  ...Arr.map(Arr.fromNullishOr(failure.proposed), (proposed) =>
    [
      `- Proposed cause: ${proposed.cause}`,
      ...Arr.map(proposed.evidence, (ref) => `  ${evidenceLineOf(ref)}`),
    ].join('\n')),
]

const outcomeBlockOf = (outcome: StepOutcome): ReadonlyArray<string> =>
  Match.valueTags(outcome, {
    Passed: () => [],
    Skipped: () => [],
    Inconclusive: ({ evidence }) => failureBlockOf({ evidence }),
    Failed: (failed) => failureBlockOf(failed),
  })

const stepSectionOf = (step: StepRecord): ReadonlyArray<string> => [
  `### ${step.id}: ${step._tag} ${outcomeOf(step.outcome)}`,
  '',
  ...detailsOf(step),
  ...outcomeBlockOf(step.outcome),
  '',
]

const errorSectionOf = (error: FailureRecord): ReadonlyArray<string> => [
  `### \`${error.code}\` (${error.cause})`,
  '',
  ...failureBlockOf(error),
  '',
]

const isSelected = (entry: LogEntry): boolean =>
  Match.valueTags(entry, {
    Console: ({ level }) => level === 'warning' || level === 'error',
    PageError: () => true,
    Network: ({ status }) => status >= 400,
    RequestFailed: () => true,
    Navigation: () => false,
    Reveal: () => false,
    LayoutShift: ({ value, hadRecentInput }) => !hadRecentInput && value > 0,
  })

const logSectionOf = (logs: ScreenSnapshot['logs']): ReadonlyArray<string> =>
  Result.match(logs, {
    onFailure: (reason) => [`Logs not read: ${reason}.`],
    onSuccess: (entries) =>
      Arr.match(Arr.filter(entries, isSelected), {
        onEmpty: () => ['No console errors, page errors or failed requests.'],
        onNonEmpty: (selected) => Arr.map(selected, (entry) => `- ${logLineOf(entry)}`),
      }),
  })

const screenSectionOf = (screen: ScreenSnapshot): ReadonlyArray<string> => [
  ...Result.match(screen.text, {
    onFailure: (reason) => [`Screen text not captured: ${reason}.`],
    onSuccess: (text) => ['```text', text, '```'],
  }),
  '',
  ...Result.match(screen.screenshot, {
    onFailure: (reason) => [`Screenshot not taken: ${reason}.`],
    onSuccess: () => ['Screenshot taken with every node showing a secret masked.'],
  }),
]

const artifactLineOf = (artifact: ArtifactRef): string => `- [${artifact.kind}](${fileNameOf(artifact.kind)})`

export const renderTracePage = (request: TracePageRequest): string =>
  [
    `# Trace: ${request.test.title}`,
    '',
    `- Test: \`${request.test.id}\` in \`${request.test.file}\``,
    `- Target: ${request.target}, agent: ${request.agent}`,
    `- Attempt: ${request.attempt.id} (retry ${request.attempt.retry}), **${request.attempt.status}**`,
    '',
    '## Steps',
    '',
    ...Arr.match(request.attempt.steps, {
      onEmpty: () => ['No step ran.', ''],
      onNonEmpty: (steps) => Arr.flatMap(steps, stepSectionOf),
    }),
    '## Errors',
    '',
    ...Arr.match(request.attempt.errors, {
      onEmpty: () => ['No error outside the steps.', ''],
      onNonEmpty: (errors) => Arr.flatMap(errors, errorSectionOf),
    }),
    '## Logs',
    '',
    ...logSectionOf(request.screen.logs),
    '',
    '## Screen at the end of the try',
    '',
    ...screenSectionOf(request.screen),
    '',
    '## Artifacts',
    '',
    ...Arr.match(request.artifacts, {
      onEmpty: () => ['No other artifact was written.'],
      onNonEmpty: (artifacts) => Arr.map(artifacts, artifactLineOf),
    }),
    '',
  ].join('\n')
