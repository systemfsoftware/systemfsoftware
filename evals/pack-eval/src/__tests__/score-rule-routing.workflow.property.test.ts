import { it } from '@effect/vitest'
import { Equal, Result, Schema } from 'effect'
import { EvidenceFloor } from '../eval-report.schema.js'
import { RoutingLabelEntry, RoutingLabels } from '../labels.schema.js'
import { Pack, PackRule } from '../pack-rule.schema.js'
import type { RuleRouting } from '../score-rule-routing.workflow.js'
import {
  LoadedRuleStems,
  RoutingCounts,
  RoutingInsufficientEvidence,
  RoutingScored,
  scoreRuleRouting,
  ScoreRuleRoutingCommand,
} from '../score-rule-routing.workflow.js'
import { Task, TaskSet } from '../task-set.schema.js'

const PACK_ID = 'pack-1'
const RULE_STEMS = ['rule-1', 'rule-2'] as const
const SPLITS = ['dev', 'test'] as const

type Split = (typeof SPLITS)[number]

interface TaskSpec {
  readonly id: string
  readonly split: Split
  readonly labelled: boolean
  readonly governing: ReadonlyArray<string>
  readonly deferred: ReadonlyArray<string>
  readonly loaded: ReadonlyArray<string>
}

const packOf = (): Pack =>
  new Pack({
    id: PACK_ID,
    rules: RULE_STEMS.map((stem, index) =>
      new PackRule({
        packId: PACK_ID,
        stem,
        title: `Rule ${index + 1}`,
        appliesWhen: ['always'],
        tags: [],
        body: 'a body',
      })
    ),
  })

const commandOfSpecs = (
  specs: ReadonlyArray<TaskSpec>,
  floor: EvidenceFloor | undefined,
): ScoreRuleRoutingCommand => {
  const input = {
    packs: [packOf()],
    taskSet: new TaskSet({
      version: 1,
      tasks: specs.map((spec) => new Task({ id: spec.id, text: `task ${spec.id}`, split: spec.split, dimensions: {} })),
    }),
    routingLabels: new RoutingLabels({
      version: 1,
      entries: specs.filter((spec) => spec.labelled).map((spec) =>
        new RoutingLabelEntry({
          taskId: spec.id,
          packId: PACK_ID,
          governing: spec.governing,
          deferred: spec.deferred,
        })
      ),
    }),
    loaded: specs.map((spec) => new LoadedRuleStems({ taskId: spec.id, packId: PACK_ID, stems: spec.loaded })),
  }
  return floor === undefined
    ? new ScoreRuleRoutingCommand(input)
    : new ScoreRuleRoutingCommand({ ...input, evidenceFloor: floor })
}

const rowsOf = (command: ScoreRuleRoutingCommand): ReadonlyArray<RuleRouting> =>
  Result.getOrThrow(scoreRuleRouting(command))

const rowAt = (rows: ReadonlyArray<RuleRouting>, stem: string, split: Split): RuleRouting | undefined =>
  rows.find((row) => row.stem === stem && row.split === split)

const MISSING = new RoutingCounts({
  truePositives: -1,
  falseNegatives: -1,
  falsePositives: -1,
  trueNegatives: -1,
})

const countsAt = (rows: ReadonlyArray<RuleRouting>, stem: string, split: Split): RoutingCounts =>
  rowAt(rows, stem, split)?.counts ?? MISSING

it.prop(
  '∀s_floorAboveTheEvidence_≡InsufficientWithCountsIntact',
  [Schema.Int, Schema.Int],
  ([positivesDraw, negativesDraw]) => {
    const positives = 1 + (Math.abs(positivesDraw) % 3)
    const negatives = 1 + (Math.abs(negativesDraw) % 3)
    const positiveSpecs: ReadonlyArray<TaskSpec> = Array.from({ length: positives }, (_, index) => ({
      id: `positive-${index}`,
      split: 'dev',
      labelled: true,
      governing: ['rule-1'],
      deferred: [],
      loaded: ['rule-1'],
    }))
    const negativeSpecs: ReadonlyArray<TaskSpec> = Array.from({ length: negatives }, (_, index) => ({
      id: `negative-${index}`,
      split: 'dev',
      labelled: true,
      governing: [],
      deferred: [],
      loaded: [],
    }))
    const deferredSpecs: ReadonlyArray<TaskSpec> = Array.from({ length: 2 }, (_, index) => ({
      id: `deferred-${index}`,
      split: 'test',
      labelled: true,
      governing: [],
      deferred: ['rule-1'],
      loaded: ['rule-1'],
    }))
    const specs = [...positiveSpecs, ...negativeSpecs, ...deferredSpecs]
    const atFloor = rowsOf(commandOfSpecs(specs, new EvidenceFloor({ positives, negatives })))
    const abovePositiveFloor = rowsOf(commandOfSpecs(specs, new EvidenceFloor({ positives: positives + 1, negatives })))
    const aboveNegativeFloor = rowsOf(commandOfSpecs(specs, new EvidenceFloor({ positives, negatives: negatives + 1 })))
    return Schema.is(RoutingScored)(rowAt(atFloor, 'rule-1', 'dev')) &&
      Schema.is(RoutingInsufficientEvidence)(rowAt(abovePositiveFloor, 'rule-1', 'dev')) &&
      Schema.is(RoutingInsufficientEvidence)(rowAt(aboveNegativeFloor, 'rule-1', 'dev')) &&
      Equal.equals(countsAt(atFloor, 'rule-1', 'dev'), countsAt(abovePositiveFloor, 'rule-1', 'dev')) &&
      Equal.equals(countsAt(abovePositiveFloor, 'rule-1', 'dev'), countsAt(aboveNegativeFloor, 'rule-1', 'dev'))
  },
)
