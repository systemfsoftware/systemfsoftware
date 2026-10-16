import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { absurd } from 'effect/Function'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Pipeable from 'effect/Pipeable'
import * as Queue from 'effect/Queue'
import { match as matchResult, type Result as EffectResult } from 'effect/Result'
import * as Stream from 'effect/Stream'
import {
  advanceBatchPhase,
  type BatchEvent,
  BatchStep,
  type BatchStepDecision,
} from './advance-batch-phase.workflow.js'
import {
  AdvanceNodeState,
  advanceNodeState,
  type NodeStateDecision,
  type NodeStateEvent,
} from './advance-node-state.workflow.js'
import * as Result from './async-result.js'
import type * as Atom from './atom.blueprint.js'
import type { BatchPhaseName } from './batch-phase.schema.js'
import {
  AsyncRead,
  type AsyncReadDecision,
  type AsyncReadStage,
  type AsyncResultPhase,
  judgeAsyncRead,
} from './judge-async-read.workflow.js'
import { type InvalidationDecision, JudgeInvalidation, judgeInvalidation } from './judge-invalidation.workflow.js'
import { judgeListenerNotify, ListenerNotify, type ListenerNotifyDecision } from './judge-listener-notify.workflow.js'
import { JudgeNodeFate, judgeNodeFate } from './judge-node-fate.workflow.js'
import { JudgeNodeRead, judgeNodeRead, type NodeReadDecision } from './judge-node-read.workflow.js'
import {
  judgePropagationSweep,
  type PropagationSweepDecision,
  type SweepKind,
  SweepMember,
} from './judge-propagation-sweep.workflow.js'
import { judgeValuePresence, PresenceQuery, type ValuePresenceDecision } from './judge-value-presence.workflow.js'
import type { NodePhase } from './node-phase.schema.js'
import {
  BuildInvalidation,
  type BuildInvalidationDecision,
  recordBuildInvalidation,
} from './record-build-invalidation.workflow.js'
import type { RegistryImpl } from './registry-engine.js'
import type { Registry } from './registry.handle.js'

type AnyNode<A = unknown> = NodeImpl<A>
type AnyLifetime<A = unknown> = Lifetime<A>

const notifyListener = (listener: () => void): void => {
  listener()
}

type AnyValue<A = unknown> = A
type NodeAction = (node: AnyNode) => void
type NodeValueAction = (node: AnyNode, value: AnyValue) => void

/**
 * Every decision below is a pure function of a closed set of engine facts, so
 * each is resolved once through its workflow at module load and the shell's
 * per-read and per-propagation paths are a table lookup (KTD4 in the
 * workflow-only-mutation plan).
 */
const PUBLIC_PHASE: Record<NodePhase, 'uninitialized' | 'stale' | 'valid' | 'removed'> = {
  uninitialized: 'uninitialized',
  stale: 'stale',
  checking: 'stale',
  valid: 'valid',
  removed: 'removed',
}

const phaseTable = <T>(build: (phase: NodePhase) => T): Record<NodePhase, T> => ({
  uninitialized: build('uninitialized'),
  stale: build('stale'),
  checking: build('checking'),
  valid: build('valid'),
  removed: build('removed'),
})

type FlagKey = 0 | 1

const flagKey = (value: boolean): FlagKey => (value ? 1 : 0)

const flagTable = <T>(build: (value: boolean) => T): Record<FlagKey, T> => ({
  0: build(false),
  1: build(true),
})

const batchPhaseTable = <T>(build: (phase: BatchPhaseName) => T): Record<BatchPhaseName, T> => ({
  disabled: build('disabled'),
  collect: build('collect'),
  commit: build('commit'),
})

const keepNodeUnchanged: NodeAction = () => {}
const keepValueUnchanged: NodeValueAction = () => {}

const decided = <Decision>(result: EffectResult<Decision, never>): Decision =>
  matchResult(result, {
    onFailure: (error) => absurd<Decision>(error),
    onSuccess: (decision) => decision,
  })

const readVerdict = (phase: NodePhase): NodeReadDecision => decided(judgeNodeRead(JudgeNodeRead.make({ phase })))

const readAction = (phase: NodePhase): NodeAction =>
  Match.value(readVerdict(phase)).pipe(
    Match.tags({
      SettleChecking: () => settleAndContinue,
      RebuildWaiting: () => rebuildNodeValue,
      KeepValue: () => keepNodeUnchanged,
    }),
    Match.exhaustive,
  )

const READ_ACTIONS: Record<NodePhase, NodeAction> = phaseTable(readAction)

const presenceVerdict = (phase: NodePhase): ValuePresenceDecision =>
  decided(judgeValuePresence(PresenceQuery.make({ phase })))

const holdsValue = (phase: NodePhase): boolean =>
  Match.value(presenceVerdict(phase)).pipe(
    Match.tags({ HoldsValue: () => true, HoldsNothing: () => false }),
    Match.exhaustive,
  )

const HOLDS_VALUE: Record<NodePhase, boolean> = phaseTable(holdsValue)

const assignFirstValueAction: NodeValueAction = (node, value) => assignFirstValue(node, value)
const assignInitialValueAction: NodeValueAction = (node, value) => assignInitialUninitialized(node, value)
const replaceInitializedValueAction: NodeValueAction = (node, value) => replaceInitializedValue(node, value)
const setValueAction: NodeValueAction = (node, value) => node.setValue(value)

const VALUE_ACTIONS: Record<NodePhase, NodeValueAction> = phaseTable((phase) =>
  HOLDS_VALUE[phase] ? replaceInitializedValueAction : assignFirstValueAction
)

const INITIAL_VALUE_ACTIONS: Record<NodePhase, NodeValueAction> = phaseTable((phase) =>
  HOLDS_VALUE[phase] ? setValueAction : assignInitialValueAction
)

const stateVerdict = (
  event: NodeStateEvent,
  phase: NodePhase,
  invalidatedDuringBuild: boolean,
  preserveInitialValueOnBuild: boolean,
): NodeStateDecision =>
  decided(advanceNodeState(AdvanceNodeState.make({
    phase,
    event,
    invalidatedDuringBuild,
    preserveInitialValueOnBuild,
  })))

const SETTLED_ACTIONS: Record<NodePhase, NodeAction> = phaseTable((phase) =>
  Match.value(stateVerdict('settled', phase, false, false)).pipe(
    Match.tags({
      BecomesValid: () => becomeValid,
      BecomesStale: () => keepNodeUnchanged,
      BecomesChecking: () => keepNodeUnchanged,
      TakeBuiltValue: () => keepNodeUnchanged,
      KeepsPhase: () => keepNodeUnchanged,
    }),
    Match.exhaustive,
  )
)

const ABANDON_ACTIONS: Record<NodePhase, NodeAction> = phaseTable((phase) =>
  Match.value(stateVerdict('invalidated', phase, false, false)).pipe(
    Match.tags({
      BecomesValid: () => keepNodeUnchanged,
      BecomesStale: () => abandonToStale,
      BecomesChecking: () => keepNodeUnchanged,
      TakeBuiltValue: () => keepNodeUnchanged,
      KeepsPhase: () => keepNodeUnchanged,
    }),
    Match.exhaustive,
  )
)

const DESCEND_ACTIONS: Record<NodePhase, NodeAction> = phaseTable((phase) =>
  Match.value(stateVerdict('descending', phase, false, false)).pipe(
    Match.tags({
      BecomesValid: () => keepNodeUnchanged,
      BecomesStale: () => keepNodeUnchanged,
      BecomesChecking: () => becomeChecking,
      TakeBuiltValue: () => keepNodeUnchanged,
      KeepsPhase: () => keepNodeUnchanged,
    }),
    Match.exhaustive,
  )
)

const RESTALE_ACTIONS: Record<FlagKey, Record<NodePhase, NodeAction>> = flagTable((invalidatedDuringBuild) =>
  phaseTable((phase) =>
    Match.value(stateVerdict('restaled', phase, invalidatedDuringBuild, false)).pipe(
      Match.tags({
        BecomesValid: () => keepNodeUnchanged,
        BecomesStale: () => clearBuildFlagToStale,
        BecomesChecking: () => keepNodeUnchanged,
        TakeBuiltValue: () => keepNodeUnchanged,
        KeepsPhase: () => keepNodeUnchanged,
      }),
      Match.exhaustive,
    )
  )
)

const BUILT_ACTIONS: Record<FlagKey, Record<NodePhase, NodeValueAction>> = flagTable((preserveInitialValueOnBuild) =>
  phaseTable((phase) =>
    Match.value(stateVerdict('built', phase, false, preserveInitialValueOnBuild)).pipe(
      Match.tags({
        BecomesValid: () => pinPreservedValue,
        BecomesStale: () => keepValueUnchanged,
        BecomesChecking: () => keepValueUnchanged,
        TakeBuiltValue: () => takeBuiltValue,
        KeepsPhase: () => keepValueUnchanged,
      }),
      Match.exhaustive,
    )
  )
)

const invalidationVerdict = (
  batchPhase: BatchPhaseName,
  lazy: boolean,
  hasListeners: boolean,
  childrenActive: boolean,
): InvalidationDecision =>
  decided(judgeInvalidation(JudgeInvalidation.make({
    batchPhase,
    lazy,
    hasListeners,
    childrenActive,
  })))

const invalidationAction = (
  batchPhase: BatchPhaseName,
  lazy: boolean,
  hasListeners: boolean,
  childrenActive: boolean,
): NodeAction =>
  Match.value(invalidationVerdict(batchPhase, lazy, hasListeners, childrenActive)).pipe(
    Match.tags({
      DeferToBatch: () => deferInvalidationToBatch,
      SkipLazyChildren: () => skipLazyInvalidation,
      InvalidateValue: () => readInvalidatedValue,
    }),
    Match.exhaustive,
  )

const INVALIDATION_ACTIONS: Record<
  BatchPhaseName,
  Record<FlagKey, Record<FlagKey, Record<FlagKey, NodeAction>>>
> = batchPhaseTable((batchPhase) =>
  flagTable((lazy) =>
    flagTable((hasListeners) =>
      flagTable((childrenActive) => invalidationAction(batchPhase, lazy, hasListeners, childrenActive))
    )
  )
)

const notifyVerdict = (batchPhase: BatchPhaseName, hasListeners: boolean): ListenerNotifyDecision =>
  decided(judgeListenerNotify(ListenerNotify.make({ batchPhase, hasListeners })))

const notifyAction = (batchPhase: BatchPhaseName, hasListeners: boolean): NodeAction =>
  Match.value(notifyVerdict(batchPhase, hasListeners)).pipe(
    Match.tags({
      StaySilent: () => keepNodeUnchanged,
      QueueForBatch: () => queueNotificationForBatch,
      NotifyNow: () => notifyNodeNow,
    }),
    Match.exhaustive,
  )

const NOTIFY_ACTIONS: Record<BatchPhaseName, Record<FlagKey, NodeAction>> = batchPhaseTable((batchPhase) =>
  flagTable((hasListeners) => notifyAction(batchPhase, hasListeners))
)

const recordInvalidationVerdict = (building: boolean, batchPhase: BatchPhaseName): BuildInvalidationDecision =>
  decided(recordBuildInvalidation(BuildInvalidation.make({ building, batchPhase })))

const recordInvalidationAction = (building: boolean, batchPhase: BatchPhaseName): NodeAction =>
  Match.value(recordInvalidationVerdict(building, batchPhase)).pipe(
    Match.tags({
      RecordDuringBuild: () => recordInvalidation,
      SkipRecording: () => keepNodeUnchanged,
    }),
    Match.exhaustive,
  )

const RECORD_INVALIDATION_ACTIONS: Record<FlagKey, Record<BatchPhaseName, NodeAction>> = flagTable((building) =>
  batchPhaseTable((batchPhase) => recordInvalidationAction(building, batchPhase))
)

const nodeFateDrops = (
  keepAlive: boolean,
  hasListeners: boolean,
  hasChildren: boolean,
  isLive: boolean,
  isWaiting: boolean,
): boolean => {
  const command = JudgeNodeFate.make({ keepAlive, hasListeners, hasChildren, isLive, isWaiting })
  const fate = decided(judgeNodeFate(command))
  return Match.value(fate).pipe(
    Match.tags({
      KeepNode: () => false,
      DropNode: () => true,
    }),
    Match.exhaustive,
  )
}

const NODE_FATE_DROPS: Record<
  FlagKey,
  Record<FlagKey, Record<FlagKey, Record<FlagKey, Record<FlagKey, boolean>>>>
> = flagTable((keepAlive) =>
  flagTable((hasListeners) =>
    flagTable((hasChildren) =>
      flagTable((isLive) =>
        flagTable((isWaiting) => nodeFateDrops(keepAlive, hasListeners, hasChildren, isLive, isWaiting))
      )
    )
  )
)

const sweepVerdict = (sweep: SweepKind, phase: NodePhase): PropagationSweepDecision =>
  decided(judgePropagationSweep(SweepMember.make({ phase, sweep })))

const sweepActed = (sweep: SweepKind, phase: NodePhase): boolean =>
  Match.value(sweepVerdict(sweep, phase)).pipe(
    Match.tags({ ActOnMember: () => true, SkipMember: () => false }),
    Match.exhaustive,
  )

const INVALIDATED_CHILD_ACTS: Record<NodePhase, boolean> = phaseTable((phase) => sweepActed('invalidated-child', phase))
const RELINKED_CHILD_ACTS: Record<NodePhase, boolean> = phaseTable((phase) => sweepActed('relinked-child', phase))
const REBUILT_PARENT_ACTS: Record<NodePhase, boolean> = phaseTable((phase) => sweepActed('rebuilt-parent', phase))

/** */
export class NodeImpl<A = unknown> extends Pipeable.Class {
  constructor(
    registry: RegistryImpl,
    atom: Atom.Atom<A>,
  ) {
    super()
    this.registry = registry
    this.atom = atom
    this.writeContext = new WriteContextImpl(registry, this)
  }
  readonly registry: RegistryImpl
  readonly atom: Atom.Atom<A>
  state: NodePhase = 'uninitialized'
  lifetime: Lifetime<A> | undefined
  writeContext: WriteContextImpl<A>
  preserveInitialValueOnBuild = false

  parents = new Set<AnyNode>()
  previousParents: Set<AnyNode> | undefined
  children = new Set<AnyNode>()
  listeners = new Set<() => void>()
  skipInvalidation = false
  building = false
  invalidatedDuringBuild = false

  currentState(): 'uninitialized' | 'stale' | 'valid' | 'removed' {
    return PUBLIC_PHASE[this.state]
  }

  get canBeRemoved(): boolean {
    const keepAlive = flagKey(this.atom.spec.keepAlive)
    const hasListeners = flagKey(this.listeners.size > 0)
    const hasChildren = flagKey(this.children.size > 0)
    const isLive = flagKey(this.state !== 'removed')
    const isWaiting = flagKey(isWaitingForInitial(this._value))
    return NODE_FATE_DROPS[keepAlive][hasListeners][hasChildren][isLive][isWaiting]
  }

  _value!: A
  value(): A {
    READ_ACTIONS[this.state](this)
    return this._value
  }

  valueOption(): Option.Option<A> {
    return HOLDS_VALUE[this.state] ? Option.some(this._value) : Option.none()
  }

  setInitialValue(value: A): void {
    INITIAL_VALUE_ACTIONS[this.state](this, value)
  }

  setValue(value: A): void {
    VALUE_ACTIONS[this.state](this, value)
  }

  addParent(parent: AnyNode): void {
    this.parents.add(parent)
    forgetPreviousParent(this, parent)
    linkChild(this, parent)
  }

  removeChild(child: AnyNode): void {
    this.children.delete(child)
  }

  invalidate(): void {
    markStale(this)
    continueInvalidate(this)
  }

  invalidateChildren(): void {
    if (this.children.size === 0) {
      return
    }
    invalidateChildSet(this)
  }

  notify(): void {
    this.listeners.forEach(notifyListener)

    const batch = this.registry.batch
    if (batch.phase === BatchPhase.commit) {
      batch.notify.delete(this)
    }
  }

  disposeLifetime(): void {
    disposeCurrentLifetime(this)
    stashParents(this)
  }

  remove() {
    this.state = 'removed'
    this.listeners.clear()
    removeLifetimeAndParents(this)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

function isWaitingForInitial<T = unknown>(value: T): boolean {
  if (Result.isResult(value) === false) {
    return false
  }
  return isInitialWaiting(value)
}

function isInitialWaiting<A = unknown, E = unknown>(value: Result.Result<A, E>): boolean {
  if (Result.isInitial(value) === false) {
    return false
  }
  return value.waiting
}

function settleAndContinue<A>(node: NodeImpl<A>): void {
  settleChecking(node)
  READ_ACTIONS[node.state](node)
}

function settleChecking<A>(node: NodeImpl<A>): void {
  for (const parent of node.parents) {
    parent.value()
  }
  SETTLED_ACTIONS[node.state](node)
}

function becomeValid<A>(node: NodeImpl<A>): void {
  node.state = 'valid'
}

function pinPreservedValue<A>(node: NodeImpl<A>): void {
  node.preserveInitialValueOnBuild = false
  node.state = 'valid'
}

function takeBuiltValue<A>(node: NodeImpl<A>, value: A): void {
  node.setValue(value)
}

function rebuildNodeValue<A>(node: NodeImpl<A>): void {
  node.lifetime = makeLifetime(node)
  node.building = true
  const value = node.atom.read(node.lifetime)
  node.building = false
  BUILT_ACTIONS[flagKey(node.preserveInitialValueOnBuild)][node.state](node, value)
  detachPreviousParents(node)
}

function detachPreviousParents<A>(node: NodeImpl<A>): void {
  if (node.previousParents === undefined) {
    return
  }
  detachParents(node, node.previousParents)
}

function detachParents<A>(node: NodeImpl<A>, parents: Set<AnyNode>): void {
  node.previousParents = undefined
  for (const parent of parents) {
    detachParent(node, parent)
  }
}

function detachParent<A>(node: NodeImpl<A>, parent: AnyNode): void {
  parent.removeChild(node)
  scheduleRemovalIfIdle(node, parent)
}

function scheduleRemovalIfIdle<A>(node: NodeImpl<A>, parent: AnyNode): void {
  if (parent.canBeRemoved) {
    node.registry.scheduleNodeRemoval(parent)
  }
}

function assignInitialUninitialized<A>(node: NodeImpl<A>, value: A): void {
  node.preserveInitialValueOnBuild = true
  node.state = 'stale'
  node._value = value
  notifyListenersIfPresent(node)
}

function assignFirstValue<A>(node: NodeImpl<A>, value: A): void {
  node.state = 'valid'
  node._value = value
  notifyListenersIfPresent(node)
}

function notifyListenersIfPresent<A>(node: NodeImpl<A>): void {
  NOTIFY_ACTIONS[BATCH_PHASE_NAMES[node.registry.batch.phase]][flagKey(node.listeners.size > 0)](node)
}

function queueNotificationForBatch<A>(node: NodeImpl<A>): void {
  node.registry.batch.notify.add(node)
}

function notifyNodeNow<A>(node: NodeImpl<A>): void {
  node.notify()
}

function replaceInitializedValue<A>(node: NodeImpl<A>, value: A): void {
  node.state = 'valid'
  replaceIfChanged(node, value)
}

function replaceIfChanged<A>(node: NodeImpl<A>, value: A): void {
  if (node.atom.equals(node._value, value)) {
    return
  }
  commitChangedValue(node, value)
}

function commitChangedValue<A>(node: NodeImpl<A>, value: A): void {
  node._value = value
  invalidateAfterValueChange(node)
  notifyListenersIfPresent(node)
}

function invalidateAfterValueChange<A>(node: NodeImpl<A>): void {
  if (node.skipInvalidation) {
    node.skipInvalidation = false
    return
  }
  node.invalidateChildren()
}

function forgetPreviousParent<A>(node: NodeImpl<A>, parent: AnyNode): void {
  if (node.previousParents !== undefined) {
    dropPreviousParent(node, node.previousParents, parent)
  }
}

function dropPreviousParent<A>(
  node: NodeImpl<A>,
  previousParents: Set<AnyNode>,
  parent: AnyNode,
): void {
  previousParents.delete(parent)
  clearPreviousParentsIfEmpty(node, previousParents)
}

function clearPreviousParentsIfEmpty<A>(
  node: NodeImpl<A>,
  previousParents: Set<AnyNode>,
): void {
  if (previousParents.size === 0) {
    node.previousParents = undefined
  }
}

function linkChild<A>(node: NodeImpl<A>, parent: AnyNode): void {
  parent.children.add(node)
  clearSkipInvalidation(parent)
}

function clearSkipInvalidation(parent: AnyNode): void {
  if (parent.skipInvalidation) {
    parent.skipInvalidation = false
  }
}

function markStale<A>(node: NodeImpl<A>): void {
  RECORD_INVALIDATION_ACTIONS[flagKey(node.building)][BATCH_PHASE_NAMES[node.registry.batch.phase]](node)
  ABANDON_ACTIONS[node.state](node)
  markDescendantsChecking(node)
}

function recordInvalidation<A>(node: NodeImpl<A>): void {
  node.invalidatedDuringBuild = true
}

function abandonToStale<A>(node: NodeImpl<A>): void {
  node.state = 'stale'
  node.disposeLifetime()
}

function markDescendantsChecking<A>(node: NodeImpl<A>): void {
  for (const child of node.children) {
    DESCEND_ACTIONS[child.state](child)
  }
}

function becomeChecking(node: AnyNode): void {
  node.state = 'checking'
  markDescendantsChecking(node)
}

function continueInvalidate<A>(node: NodeImpl<A>): void {
  INVALIDATION_ACTIONS[BATCH_PHASE_NAMES[node.registry.batch.phase]][flagKey(node.atom.spec.lazy)][
    flagKey(
      node.listeners.size > 0,
    )
  ][flagKey(childrenAreActive(node.children))](node)
}

function deferInvalidationToBatch<A>(node: NodeImpl<A>): void {
  node.registry.batch.stale.add(node)
}

function skipLazyInvalidation<A>(node: NodeImpl<A>): void {
  node.invalidateChildren()
  node.skipInvalidation = true
}

function readInvalidatedValue<A>(node: NodeImpl<A>): void {
  node.value()
}

function invalidateChildSet<A>(node: NodeImpl<A>): void {
  const children = node.children
  node.children = new Set()
  children.forEach(markStale)
  children.forEach(continueInvalidatedChild)
  children.forEach((child) => relinkSweptChild(node, child))
}

function continueInvalidatedChild(node: AnyNode): void {
  if (INVALIDATED_CHILD_ACTS[node.state]) {
    continueInvalidate(node)
  }
}

function relinkSweptChild<A>(node: NodeImpl<A>, child: AnyNode): void {
  if (RELINKED_CHILD_ACTS[child.state]) {
    node.children.add(child)
  }
}

function disposeCurrentLifetime<A>(node: NodeImpl<A>): void {
  if (node.lifetime !== undefined) {
    node.lifetime.dispose()
    node.lifetime = undefined
  }
}

function stashParents<A>(node: NodeImpl<A>): void {
  if (node.parents.size !== 0) {
    node.previousParents = node.parents
    node.parents = new Set()
  }
}

function removeLifetimeAndParents<A>(node: NodeImpl<A>): void {
  node.disposeLifetime()
  detachRemovedParents(node)
}

function detachRemovedParents<A>(node: NodeImpl<A>): void {
  if (node.previousParents === undefined) {
    return
  }
  removeFromParents(node, node.previousParents)
}

function removeFromParents<A>(node: NodeImpl<A>, parents: Set<AnyNode>): void {
  node.previousParents = undefined
  for (const parent of parents) {
    removeFromParent(node, parent)
  }
}

function removeFromParent<A>(node: NodeImpl<A>, parent: AnyNode): void {
  parent.removeChild(node)
  removeParentIfIdle(node, parent)
}

function removeParentIfIdle<A>(node: NodeImpl<A>, parent: AnyNode): void {
  if (parent.canBeRemoved) {
    node.registry.removeNode(parent)
  }
}

function childrenAreActive(children: Set<AnyNode>): boolean {
  if (children.size === 0) {
    return false
  }
  return walkActiveChildren(children)
}

function walkActiveChildren(start: Set<AnyNode>): boolean {
  const stack: Array<Set<AnyNode>> = [start]
  return walkActiveStack(stack, 0)
}

function walkActiveStack(stack: Array<Set<AnyNode>>, index: number): boolean {
  if (index >= stack.length) {
    return false
  }
  return scanThenContinue(stack, index)
}

function scanThenContinue(stack: Array<Set<AnyNode>>, index: number): boolean {
  if (scanActiveSet(stack[index], stack)) {
    return true
  }
  return walkActiveStack(stack, index + 1)
}

function scanActiveSet(
  current: Set<AnyNode> | undefined,
  stack: Array<Set<AnyNode>>,
): boolean {
  if (current === undefined) {
    return false
  }
  return scanDefinedSet(current, stack)
}

function scanDefinedSet(
  current: Set<AnyNode>,
  stack: Array<Set<AnyNode>>,
): boolean {
  let found = false
  current.forEach((child) => {
    found = takeActiveChild(found, child, stack)
  })
  return found
}

function takeActiveChild(
  found: boolean,
  child: AnyNode,
  stack: Array<Set<AnyNode>>,
): boolean {
  if (found) {
    return true
  }
  return childSignalsActive(child, stack)
}

function childSignalsActive(
  child: AnyNode,
  stack: Array<Set<AnyNode>>,
): boolean {
  if (childIsLive(child)) {
    return true
  }
  pushChildSet(child, stack)
  return false
}

function childIsLive(child: AnyNode): boolean {
  if (child.atom.spec.lazy === false) {
    return true
  }
  return child.listeners.size > 0
}

function pushChildSet(child: AnyNode, stack: Array<Set<AnyNode>>): void {
  if (child.children.size > 0) {
    stack.push(child.children)
  }
}

interface Lifetime<A> extends Atom.AtomContext {
  isFn: boolean
  readonly registry: RegistryImpl
  readonly node: NodeImpl<A>
  finalizers: (() => void)[] | undefined
  disposed: boolean
  readonly dispose: () => void
}

type ResultOptions = {
  readonly suspendOnWaiting?: boolean | undefined
}

type StreamOptions = {
  readonly withoutInitialValue?: boolean
}

const LifetimeProto: Omit<AnyLifetime, 'node' | 'finalizers' | 'disposed' | 'isFn' | 'registry'> = {
  addFinalizer(this: AnyLifetime, f: () => void): void {
    if (this.disposed) {
      f()
      return
    }
    pushFinalizer(this, f)
  },

  get<A>(this: AnyLifetime, atom: Atom.Atom<A>): A {
    if (this.disposed) {
      return this.node.registry.get(atom)
    }
    return getLive(this, atom)
  },

  result<A, E>(
    this: AnyLifetime,
    atom: Atom.Atom<Result.Result<A, E>>,
    options?: ResultOptions,
  ): Effect.Effect<A, E> {
    if (isDisposedOrFn(this)) {
      return this.resultOnce(atom, options)
    }
    return resultFromLive(this, atom, options)
  },

  resultOnce<A, E>(
    this: AnyLifetime,
    atom: Atom.Atom<Result.Result<A, E>>,
    options?: ResultOptions,
  ): Effect.Effect<A, E> {
    return Effect.callback<A, E>((resume) => resultOnceCallback(this, atom, options, resume))
  },

  setResult<A, E, W>(
    this: AnyLifetime,
    atom: Atom.Writable<Result.Result<A, E>, W>,
    value: W,
  ): Effect.Effect<A, E> {
    if (this.disposed) return Effect.never
    this.node.registry.set(atom, value)
    return this.resultOnce(atom, { suspendOnWaiting: true })
  },

  some<A>(this: AnyLifetime, atom: Atom.Atom<Option.Option<A>>): Effect.Effect<A> {
    if (isDisposedOrFn(this)) {
      return this.someOnce(atom)
    }
    return someFromOption(this.get(atom))
  },

  someOnce<A>(this: AnyLifetime, atom: Atom.Atom<Option.Option<A>>): Effect.Effect<A> {
    return Effect.callback<A>((resume) => someOnceCallback(this, atom, resume))
  },

  once<A>(this: AnyLifetime, atom: Atom.Atom<A>): A {
    return this.node.registry.get(atom)
  },

  self<A>(this: Lifetime<A>): Option.Option<A> {
    if (this.disposed) return Option.none()
    return this.node.valueOption()
  },

  refresh<A>(this: AnyLifetime, atom: Atom.Atom<A>): void {
    if (this.disposed) return
    this.node.registry.refresh(atom)
  },

  refreshSelf(this: AnyLifetime): void {
    if (this.disposed) return
    this.node.invalidate()
  },

  mount<A>(this: AnyLifetime, atom: Atom.Atom<A>): void {
    if (this.disposed) return
    this.addFinalizer(this.node.registry.mount(atom))
  },

  subscribe<A>(this: AnyLifetime, atom: Atom.Atom<A>, f: (_: A) => void, options?: {
    readonly immediate?: boolean
  }): void {
    if (this.disposed) return
    this.addFinalizer(this.node.registry.subscribe(atom, f, options))
  },

  setSelf<A>(this: AnyLifetime, a: A): void {
    if (this.disposed) return
    this.node.setValue(a)
  },

  set<R, W>(this: AnyLifetime, atom: Atom.Writable<R, W>, value: W): void {
    if (this.disposed) return
    this.node.registry.set(atom, value)
  },

  stream<A>(this: AnyLifetime, atom: Atom.Atom<A>, options?: StreamOptions) {
    if (this.disposed) return Stream.empty
    return Stream.callback<A>((queue) =>
      Effect.sync(() => {
        this.subscribe(atom, (value) => Queue.offerUnsafe(queue, value), {
          immediate: includeInitialValue(options),
        })
      })
    )
  },

  streamResult<A, E>(this: AnyLifetime, atom: Atom.Atom<Result.Result<A, E>>, options?: {
    readonly withoutInitialValue?: boolean
    readonly bufferSize?: number
  }): Stream.Stream<A, E> {
    return this.stream(atom, options).pipe(
      Stream.filter(Result.isNotInitial),
      Stream.mapEffect((result) => streamResultEffect(result)),
    )
  },

  dispose(this: AnyLifetime): void {
    this.disposed = true
    runFinalizers(this)
  },
}

function isDisposedOrFn(lifetime: AnyLifetime): boolean {
  if (lifetime.disposed) {
    return true
  }
  return lifetime.isFn
}

function pushFinalizer(lifetime: AnyLifetime, f: () => void): void {
  if (lifetime.finalizers === undefined) {
    lifetime.finalizers = [f]
    return
  }
  lifetime.finalizers.push(f)
}

function getLive<A>(lifetime: AnyLifetime, atom: Atom.Atom<A>): A {
  const parent = lifetime.node.registry.ensureNode(atom)
  const value = parent.value()
  lifetime.node.addParent(parent)
  return value
}

function resultFromLive<A, E>(
  lifetime: AnyLifetime,
  atom: Atom.Atom<Result.Result<A, E>>,
  options: ResultOptions | undefined,
): Effect.Effect<A, E> {
  return resultFromValue(lifetime.get(atom), options)
}

const suspendOnWaitingOption = (options: ResultOptions | undefined): boolean =>
  options === undefined ? false : options.suspendOnWaiting === true

const settledResultPhaseOf = <A, E>(result: Result.Result<A, E>): AsyncResultPhase =>
  Result.isSuccess(result) ? 'success' : 'failure'

const resultPhaseOf = <A, E>(result: Result.Result<A, E>): AsyncResultPhase =>
  Result.isInitial(result) ? 'initial' : settledResultPhaseOf(result)

const asyncReadStageTable = <T>(build: (stage: AsyncReadStage) => T): Record<AsyncReadStage, T> => ({
  immediate: build('immediate'),
  'await-start': build('await-start'),
  'await-event': build('await-event'),
})

const asyncResultPhaseTable = <T>(build: (phase: AsyncResultPhase) => T): Record<AsyncResultPhase, T> => ({
  initial: build('initial'),
  success: build('success'),
  failure: build('failure'),
})

const asyncReadVerdictFor = (
  stage: AsyncReadStage,
  phase: AsyncResultPhase,
  waiting: boolean,
  suspendOnWaiting: boolean,
): AsyncReadDecision => decided(judgeAsyncRead(AsyncRead.make({ stage, phase, waiting, suspendOnWaiting })))

const ASYNC_READ_VERDICTS: Record<
  AsyncReadStage,
  Record<AsyncResultPhase, Record<FlagKey, Record<FlagKey, AsyncReadDecision>>>
> = asyncReadStageTable((stage) =>
  asyncResultPhaseTable((phase) =>
    flagTable((waiting) =>
      flagTable((suspendOnWaiting) => asyncReadVerdictFor(stage, phase, waiting, suspendOnWaiting))
    )
  )
)

const asyncReadVerdict = <A, E>(
  stage: AsyncReadStage,
  result: Result.Result<A, E>,
  options: ResultOptions | undefined,
): AsyncReadDecision =>
  ASYNC_READ_VERDICTS[stage][resultPhaseOf(result)][flagKey(result.waiting)][
    flagKey(suspendOnWaitingOption(options))
  ]

function resultFromValue<A, E>(
  result: Result.Result<A, E>,
  options: ResultOptions | undefined,
): Effect.Effect<A, E> {
  return Match.value(asyncReadVerdict('immediate', result, options)).pipe(
    Match.tags({
      SuspendImmediately: () => Effect.never,
      ResolveWithResult: () => resultToEffect(result),
      AwaitNextResult: () => Effect.never,
      KeepAwaiting: () => Effect.never,
    }),
    Match.exhaustive,
  )
}

function resultToEffect<A, E>(result: Result.Result<A, E>): Effect.Effect<A, E> {
  if (Result.isFailure(result)) {
    return Exit.failCause(result.cause)
  }
  return succeedResult(result)
}

function succeedResult<A, E>(result: Result.Result<A, E>): Effect.Effect<A, E> {
  if (Result.isSuccess(result)) {
    return Effect.succeed(result.value)
  }
  return Effect.never
}

function resultOnceCallback<A, E>(
  lifetime: AnyLifetime,
  atom: Atom.Atom<Result.Result<A, E>>,
  options: ResultOptions | undefined,
  resume: (effect: Effect.Effect<A, E>) => void,
): Effect.Effect<void> | void {
  const result = lifetime.once(atom)
  return Match.value(asyncReadVerdict('await-start', result, options)).pipe(
    Match.tags({
      AwaitNextResult: () => subscribeUntilReady(lifetime, atom, options, resume),
      ResolveWithResult: () => resumeReady(result, resume),
      SuspendImmediately: () => resumeReady(result, resume),
      KeepAwaiting: () => resumeReady(result, resume),
    }),
    Match.exhaustive,
  )
}

function subscribeUntilReady<A, E>(
  lifetime: AnyLifetime,
  atom: Atom.Atom<Result.Result<A, E>>,
  options: ResultOptions | undefined,
  resume: (effect: Effect.Effect<A, E>) => void,
): Effect.Effect<void> {
  const cancel = lifetime.node.registry.subscribe(atom, (next) => {
    onResultSubscription(next, options, cancel, resume)
  }, { immediate: false })
  return Effect.sync(cancel)
}

function onResultSubscription<A, E>(
  result: Result.Result<A, E>,
  options: ResultOptions | undefined,
  cancel: () => void,
  resume: (effect: Effect.Effect<A, E>) => void,
): void {
  Match.value(asyncReadVerdict('await-event', result, options)).pipe(
    Match.tags({
      KeepAwaiting: () => undefined,
      ResolveWithResult: () => resolveResultSubscription(result, cancel, resume),
      SuspendImmediately: () => resolveResultSubscription(result, cancel, resume),
      AwaitNextResult: () => resolveResultSubscription(result, cancel, resume),
    }),
    Match.exhaustive,
  )
}

function resolveResultSubscription<A, E>(
  result: Result.Result<A, E>,
  cancel: () => void,
  resume: (effect: Effect.Effect<A, E>) => void,
): void {
  cancel()
  resumeReady(result, resume)
}

function resumeReady<A, E>(
  result: Result.Result<A, E>,
  resume: (effect: Effect.Effect<A, E>) => void,
): void {
  if (Result.isInitial(result)) {
    return
  }
  resume(Result.toExit(result))
}

function someFromOption<A>(result: Option.Option<A>): Effect.Effect<A> {
  if (Option.isNone(result)) {
    return Effect.never
  }
  return Effect.succeed(result.value)
}

function someOnceCallback<A>(
  lifetime: AnyLifetime,
  atom: Atom.Atom<Option.Option<A>>,
  resume: (effect: Effect.Effect<A>) => void,
): Effect.Effect<void> | void {
  const result = lifetime.once(atom)
  if (Option.isSome(result)) {
    return resume(Effect.succeed(result.value))
  }
  return subscribeUntilSome(lifetime, atom, resume)
}

function subscribeUntilSome<A>(
  lifetime: AnyLifetime,
  atom: Atom.Atom<Option.Option<A>>,
  resume: (effect: Effect.Effect<A>) => void,
): Effect.Effect<void> {
  const cancel = lifetime.node.registry.subscribe(atom, (next) => {
    onSomeSubscription(next, cancel, resume)
  }, { immediate: false })
  return Effect.sync(cancel)
}

function onSomeSubscription<A>(
  result: Option.Option<A>,
  cancel: () => void,
  resume: (effect: Effect.Effect<A>) => void,
): void {
  if (Option.isNone(result)) {
    return
  }
  cancel()
  resume(Effect.succeed(result.value))
}

function includeInitialValue(options: StreamOptions | undefined): boolean {
  if (options === undefined) {
    return true
  }
  return options.withoutInitialValue !== true
}

function streamResultEffect<A, E>(result: Result.Result<A, E>): Effect.Effect<A, E> {
  if (Result.isSuccess(result)) {
    return Effect.succeed(result.value)
  }
  return failIfFailure(result)
}

function failIfFailure<A, E>(result: Result.Result<A, E>): Effect.Effect<A, E> {
  if (Result.isFailure(result)) {
    return Effect.failCause(result.cause)
  }
  return Effect.never
}

function runFinalizers(lifetime: AnyLifetime): void {
  if (lifetime.finalizers === undefined) {
    return
  }
  runFinalizerList(lifetime, lifetime.finalizers)
}

function runFinalizerList(lifetime: AnyLifetime, finalizers: Array<() => void>): void {
  lifetime.finalizers = undefined
  runFinalizersFrom(finalizers, finalizers.length - 1)
}

function runFinalizersFrom(finalizers: Array<() => void>, i: number): void {
  if (i < 0) {
    return
  }
  runOneThenRest(finalizers, i)
}

function runOneThenRest(finalizers: Array<() => void>, i: number): void {
  runFinalizer(finalizers[i])
  runFinalizersFrom(finalizers, i - 1)
}

function runFinalizer(finalizer: (() => void) | undefined): void {
  if (finalizer !== undefined) {
    finalizer()
  }
}

const makeLifetime = <A>(node: NodeImpl<A>): Lifetime<A> => {
  const lifetime: Lifetime<A> = Object.assign(
    function get<A2>(atom: Atom.Atom<A2>): A2 {
      if (isDisposedOrFn(lifetime)) {
        return node.registry.get(atom)
      }
      return readAndLink(node, atom)
    },
    LifetimeProto,
    {
      isFn: false,
      disposed: false,
      finalizers: undefined,
      node,
      registry: node.registry,
    },
  )
  return lifetime
}

function readAndLink<A, A2>(node: NodeImpl<A>, atom: Atom.Atom<A2>): A2 {
  const parent = node.registry.ensureNode(atom)
  const value = parent.value()
  node.addParent(parent)
  return value
}
class WriteContextImpl<A> extends Pipeable.Class implements Atom.WriteContext<A> {
  constructor(
    registry: RegistryImpl,
    node: NodeImpl<A>,
  ) {
    super()
    this.writeRegistry = registry
    this.registryHandle = registry.handle
    this.node = node
  }
  get registry(): Registry {
    return this.registryHandle
  }
  readonly writeRegistry: RegistryImpl
  readonly registryHandle: Registry
  readonly node: NodeImpl<A>
  get<A>(atom: Atom.Atom<A>): A {
    return this.writeRegistry.get(atom)
  }
  set<R, W>(atom: Atom.Writable<R, W>, value: W) {
    return this.writeRegistry.set(atom, value)
  }
  setSelf(value: A) {
    return this.node.setValue(value)
  }
  refreshSelf() {
    return this.node.invalidate()
  }
}

// -----------------------------------------------------------------------------
// batching
// -----------------------------------------------------------------------------

/** */
export const BatchPhase: {
  readonly disabled: 0
  readonly collect: 1
  readonly commit: 2
} = {
  disabled: 0,
  collect: 1,
  commit: 2,
}
/** */
export type BatchPhase = 0 | 1 | 2

const BATCH_PHASE_NAMES: Record<BatchPhase, BatchPhaseName> = {
  [BatchPhase.disabled]: 'disabled',
  [BatchPhase.collect]: 'collect',
  [BatchPhase.commit]: 'commit',
}

export interface BatchState {
  phase: BatchPhase
  depth: number
  readonly stale: Set<AnyNode>
  readonly notify: Set<AnyNode>
}

/** */
export const makeBatchState = (): BatchState => ({
  phase: BatchPhase.disabled,
  depth: 0,
  stale: new Set(),
  notify: new Set(),
})

/**
 * Batch state lifecycle for one registry, run by the engine's `batchOn`.
 *
 * **Details**
 *
 * Starting, committing, and finishing take the engine's own state record so
 * concurrent registries never share collect, rebuild, or notification state.
 */
export interface BatchRunner {
  readonly startBatch: (batch: BatchState) => void
  readonly commitBatchIfOutermost: (batch: BatchState) => void
  readonly finishBatch: (batch: BatchState) => void
}
export const batchRunner: BatchRunner = {
  startBatch,
  commitBatchIfOutermost,
  finishBatch,
}

const batchStepVerdict = (depth: number, event: BatchEvent): BatchStepDecision =>
  decided(advanceBatchPhase(BatchStep.make({ depth, event })))

function startBatch(batch: BatchState): void {
  batch.phase = BatchPhase.collect
  batch.depth++
}

function commitBatchIfOutermost(batch: BatchState): void {
  Match.value(batchStepVerdict(batch.depth, 'commit-request')).pipe(
    Match.tags({
      RebuildAndNotify: () => commitOutermostBatch(batch),
      ResetBatch: () => undefined,
      StayNested: () => undefined,
    }),
    Match.exhaustive,
  )
}

function commitOutermostBatch(batch: BatchState): void {
  rebuildStaleNodes(batch)
  notifyBatchedNodes(batch)
}

function finishBatch(batch: BatchState): void {
  const verdict = batchStepVerdict(batch.depth, 'finish-request')
  batch.depth--
  Match.value(verdict).pipe(
    Match.tags({
      ResetBatch: () => resetFinishedBatch(batch),
      RebuildAndNotify: () => undefined,
      StayNested: () => undefined,
    }),
    Match.exhaustive,
  )
}

function resetFinishedBatch(batch: BatchState): void {
  batch.phase = BatchPhase.disabled
  batch.stale.clear()
}

function rebuildStaleNodes(batch: BatchState): void {
  for (const node of batch.stale) {
    batchRebuildNode(node)
  }
}

function notifyBatchedNodes(batch: BatchState): void {
  batch.phase = BatchPhase.commit
  for (const node of batch.notify) {
    node.notify()
  }
  batch.notify.clear()
}

function batchRebuildNode(node: AnyNode): void {
  RESTALE_ACTIONS[flagKey(node.invalidatedDuringBuild)][node.state](node)
  rebuildParents(node)
  node.value()
}

function clearBuildFlagToStale(node: AnyNode): void {
  node.invalidatedDuringBuild = false
  node.state = 'stale'
  node.disposeLifetime()
}

function rebuildParents(node: AnyNode): void {
  for (const parent of node.parents) {
    rebuildParentIfNeeded(parent)
  }
}

function rebuildParentIfNeeded(parent: AnyNode): void {
  if (REBUILT_PARENT_ACTS[parent.state]) {
    batchRebuildNode(parent)
  }
}
