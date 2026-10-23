import { it } from '@systemfsoftware/vitest'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import {
  ClassifyReplay,
  classifyReplay,
  type ReplayDecision,
  type ReplayOutcome,
  type ReplayStep,
  type ReplayTranscript,
} from '../../cache/classify-replay.workflow.js'
import {
  type Anchor,
  type ControlDescriptor,
  entryWireTextOf,
  type RecordedAction,
  type TraceEntry,
} from '../../cache/entry.schema.js'
import type { Action } from '../../engine/action.schema.js'
import type { Observation } from '../../engine/observation.schema.js'
import type { SemanticNode } from '../../engine/semantic-node.schema.js'
import { recordedFlow, type RecordedFlowDecision, RecordFlow } from '../recorded-flow.workflow.js'

const NEUTRAL_STATES: SemanticNode['states'] = { disabled: false, hidden: false }

const PERFORMED: ReplayOutcome = { _tag: 'Performed' }

const nodeOf = (
  id: string,
  role: string | undefined,
  name: string | undefined,
  states: SemanticNode['states'],
  children: ReadonlyArray<SemanticNode>,
): SemanticNode => ({
  ref: { id, revision: 'recorded' },
  ...(role === undefined ? {} : { role }),
  ...(name === undefined ? {} : { name }),
  states,
  children,
})

const observationOf = (drawn: Observation, tree: ReadonlyArray<SemanticNode>): Observation => ({
  route: drawn.route,
  revision: drawn.revision,
  tree,
})

const controlNameOf = (seed: number, index: number, kind: string): string =>
  `${kind}-control-${String(index)}-${String(Math.abs(seed))}`

const checkboxNameOf = (seed: number): string => `check-1-${String(Math.abs(seed))}`

const controlOf = (seed: number, index: number, kind: string): SemanticNode =>
  nodeOf(`node:${controlNameOf(seed, index, kind)}`, 'button', controlNameOf(seed, index, kind), NEUTRAL_STATES, [])

const checkboxOf = (seed: number, checked: boolean): SemanticNode =>
  nodeOf(`node:${checkboxNameOf(seed)}`, 'checkbox', checkboxNameOf(seed), { ...NEUTRAL_STATES, checked }, [])

// A start tree whose `leave` control disappears, whose `check` control flips, and to which the end adds a `new` control.
const startTreeOf = (seed: number): ReadonlyArray<SemanticNode> => [
  nodeOf('root', 'main', 'app', NEUTRAL_STATES, [
    controlOf(seed, 1, 'stay'),
    controlOf(seed, 2, 'stay'),
    checkboxOf(seed, true),
    controlOf(seed, 3, 'leave'),
  ]),
]

const endTreeOf = (seed: number): ReadonlyArray<SemanticNode> => [
  nodeOf('root', 'main', 'app', NEUTRAL_STATES, [
    controlOf(seed, 1, 'stay'),
    controlOf(seed, 2, 'stay'),
    checkboxOf(seed, false),
    controlOf(seed, 4, 'new'),
  ]),
]

const emptyRootTreeOf = (): ReadonlyArray<SemanticNode> => [nodeOf('root', 'main', 'app', NEUTRAL_STATES, [])]

const dozenTreeOf = (seed: number): ReadonlyArray<SemanticNode> => [
  nodeOf('root', 'main', 'app', NEUTRAL_STATES, Arr.makeBy(12, (index) => controlOf(seed, index, 'new'))),
]

const tapOf = (name: string): Action => ({
  _tag: 'Tap',
  target: {
    expression: { kind: 'ByRole', role: 'button', name: { value: name, exact: true } },
    label: `button "${name}"`,
  },
})

const NAVIGATE_RECORDED: RecordedAction = {
  action: { _tag: 'Navigate', url: 'https://app.example.test/next' },
  controls: [],
}

const stayDescriptorOf = (seed: number, index: number): ControlDescriptor => ({
  role: 'button',
  name: controlNameOf(seed, index, 'stay'),
  context: ['app'],
})

const stayRecordedOf = (seed: number, index: number): RecordedAction => ({
  action: tapOf(controlNameOf(seed, index, 'stay')),
  controls: [stayDescriptorOf(seed, index)],
})

const SECRET_FILL: Action = {
  _tag: 'Fill',
  target: {
    expression: { kind: 'ByRole', role: 'textbox', name: { value: 'password', exact: true } },
    label: 'textbox "password"',
  },
  value: { secret: 'pw' },
}

const PASSWORD_FIELD: SemanticNode = nodeOf('node:password', 'textbox', 'password', NEUTRAL_STATES, [])

const DONE_FIELD: SemanticNode = nodeOf('node:done', 'button', 'done-control-1', NEUTRAL_STATES, [])

const chainOf = (names: ReadonlyArray<string>, leaf: SemanticNode): SemanticNode =>
  names.reduceRight((node, name) => nodeOf(`ancestor:${name}`, undefined, name, NEUTRAL_STATES, [node]), leaf)

const controlChainOf = (control: ControlDescriptor): SemanticNode =>
  chainOf(
    control.context,
    nodeOf(
      `node:${Option.getOrElse(Option.fromNullishOr(control.name), () => '')}`,
      control.role,
      control.name,
      NEUTRAL_STATES,
      [],
    ),
  )

// The transcript oracle: the recorded actions replay against one step observation per action, each holding
// every control of that action exactly once, and the start/end observations the entry was recorded from.
const transcriptOf = (
  start: Observation,
  end: Observation,
  actions: ReadonlyArray<RecordedAction>,
): ReplayTranscript => ({
  start,
  steps: actions.map(
    (recorded): ReplayStep => ({
      observation: observationOf(start, recorded.controls.map(controlChainOf)),
      outcome: PERFORMED,
    }),
  ),
  end,
  alerts: [],
})

const commandOf = (
  drawn: RecordFlow,
  start: Observation,
  end: Observation,
  actions: Array<RecordedAction>,
): RecordFlow => new RecordFlow({ keyedBy: drawn.keyedBy, start, end, actions, provenance: drawn.provenance })

const decidedOf = (result: Result.Result<RecordedFlowDecision, never>): RecordedFlowDecision =>
  Result.match(result, { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const replayDecidedOf = (result: Result.Result<ReplayDecision, never>): ReplayDecision =>
  Result.match(result, { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const recordedEntryOf = (decision: RecordedFlowDecision): Option.Option<TraceEntry> =>
  Match.value(decision).pipe(
    Match.tag('Recorded', ({ entry }): Option.Option<TraceEntry> => Option.some(entry)),
    Match.orElse((): Option.Option<TraceEntry> => Option.none()),
  )

const notRecordableWith = (
  decision: RecordedFlowDecision,
  reason: 'no-actions' | 'too-many-actions' | 'no-change-evidenced',
): boolean =>
  Match.value(decision).pipe(
    Match.tag('NotRecordable', (refused) => refused.reason === reason),
    Match.orElse(() => false),
  )

const replayedActionsOf = (decision: ReplayDecision): Option.Option<ReadonlyArray<Action>> =>
  Match.value(decision).pipe(
    Match.tag('Replayed', (replayed): Option.Option<ReadonlyArray<Action>> => Option.some(replayed.actions)),
    Match.orElse((): Option.Option<ReadonlyArray<Action>> => Option.none()),
  )

const replayVerdictOf = (entry: TraceEntry, transcript: ReplayTranscript): ReplayDecision =>
  replayDecidedOf(classifyReplay(new ClassifyReplay({ mode: 'read-write', entry, transcript })))

// The round-trip law: the entry `recordedFlow` records for a live run replays as `Replayed` with the same
// actions under `classifyReplay`, the second implementation of the recording contract.
const replaysSameActionsOf = (
  entry: TraceEntry,
  transcript: ReplayTranscript,
  actions: ReadonlyArray<RecordedAction>,
): boolean =>
  replayedActionsOf(replayVerdictOf(entry, transcript)).pipe(
    Option.match({
      onNone: () => false,
      onSome: (replayed) => JSON.stringify(replayed) === JSON.stringify(actions.map((recorded) => recorded.action)),
    }),
  )

const anchorNamesOf = (entry: TraceEntry): ReadonlyArray<string> =>
  entry.anchors.appeared.map((anchor) => Option.getOrElse(Option.fromNullishOr(anchor.control.name), () => ''))

it.prop(
  '∀t_RecordFlow_≡ReplayedWithSameActions',
  { of: [RecordFlow, Schema.Int], subject: recordedFlow, arbitrary: { seed: 505_201 } },
  (subject, [drawn, seed]) => {
    const start = observationOf(drawn.start, startTreeOf(seed))
    const end = observationOf(drawn.end, endTreeOf(seed))
    const actions = [stayRecordedOf(seed, 1), stayRecordedOf(seed, 2), NAVIGATE_RECORDED]
    const decision = decidedOf(subject(commandOf(drawn, start, end, actions)))
    const transcript = transcriptOf(start, end, actions)
    return recordedEntryOf(decision).pipe(
      Option.match({
        onNone: () => false,
        onSome: (entry) => replaysSameActionsOf(entry, transcript, actions),
      }),
    )
  },
)

it.prop(
  '∀t_RecordFlow_→NoChangeEvidencedWhenTreesMatch',
  { of: [RecordFlow, Schema.Int], subject: recordedFlow, arbitrary: { seed: 505_202 } },
  (subject, [drawn, seed]) => {
    const decision = decidedOf(subject(commandOf(drawn, drawn.start, drawn.start, [stayRecordedOf(seed, 1)])))
    return notRecordableWith(decision, 'no-change-evidenced')
  },
)

it.prop(
  '∀t_RecordFlow_→ActionCountRefused',
  { of: [RecordFlow], subject: recordedFlow, arbitrary: { seed: 505_203 } },
  (subject, [drawn]) => {
    const empty = decidedOf(subject(commandOf(drawn, drawn.start, drawn.end, [])))
    const many = decidedOf(subject(commandOf(drawn, drawn.start, drawn.end, Arr.makeBy(51, () => NAVIGATE_RECORDED))))
    return notRecordableWith(empty, 'no-actions') && notRecordableWith(many, 'too-many-actions')
  },
)

it.prop(
  '∀t_RecordFlow_→AppearedAnchorsCappedAtEight',
  { of: [RecordFlow, Schema.Int], subject: recordedFlow, arbitrary: { seed: 505_204 } },
  (subject, [drawn, seed]) => {
    const decision = decidedOf(subject(commandOf(
      drawn,
      observationOf(drawn.start, emptyRootTreeOf()),
      observationOf(drawn.end, dozenTreeOf(seed)),
      [NAVIGATE_RECORDED],
    )))
    const expectedNames = Arr.makeBy(8, (index) => controlNameOf(seed, index, 'new'))
    return recordedEntryOf(decision).pipe(
      Option.match({
        onNone: () => false,
        onSome: (entry) =>
          entry.anchors.gone.length === 0 &&
          JSON.stringify(anchorNamesOf(entry)) === JSON.stringify(expectedNames),
      }),
    )
  },
)

it.prop(
  '∀t_RecordFlow_→CheckedFlipAppearsWithEndState',
  { of: [RecordFlow, Schema.Int], subject: recordedFlow, arbitrary: { seed: 505_205 } },
  (subject, [drawn, seed]) => {
    const decision = decidedOf(subject(commandOf(
      drawn,
      observationOf(drawn.start, [checkboxOf(seed, true)]),
      observationOf(drawn.end, [checkboxOf(seed, false)]),
      [NAVIGATE_RECORDED],
    )))
    const expectedAnchor: Anchor = {
      control: { role: 'checkbox', name: checkboxNameOf(seed), context: [] },
      states: { checked: false },
    }
    return recordedEntryOf(decision).pipe(
      Option.match({
        onNone: () => false,
        onSome: (entry) =>
          entry.anchors.gone.length === 0 &&
          JSON.stringify(entry.anchors.appeared) === JSON.stringify([expectedAnchor]),
      }),
    )
  },
)

it.prop(
  '∀t_RecordFlow_→SecretRefRecordedWithoutItsValue',
  { of: [RecordFlow, Schema.String], subject: recordedFlow, arbitrary: { seed: 505_206 } },
  (subject, [drawn, secretText]) => {
    const secretValue = `hunter2-${secretText}`
    const decision = decidedOf(subject(commandOf(
      drawn,
      observationOf(drawn.start, [PASSWORD_FIELD]),
      observationOf(drawn.end, [PASSWORD_FIELD, DONE_FIELD]),
      [{ action: SECRET_FILL, controls: [] }],
    )))
    return recordedEntryOf(decision).pipe(
      Option.match({
        onNone: () => false,
        onSome: (entry) =>
          JSON.stringify(entry.actions[0]?.action) === JSON.stringify(SECRET_FILL) &&
          Option.match(entryWireTextOf(entry), {
            onNone: () => false,
            onSome: (wire) => wire.includes('"pw"') && !wire.includes(secretValue),
          }),
      }),
    )
  },
)
