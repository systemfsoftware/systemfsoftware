import { Workflow } from '@systemfsoftware/effect-cell-types'
import * as Arr from 'effect/Array'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Predicate from 'effect/Predicate'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as SchemaAST from 'effect/SchemaAST'

import { ControlDescriptor } from '../cache/entry.schema.js'
import { Action, WaitState } from '../engine/action.schema.js'
import { EngineCapability } from '../engine/capability.schema.js'
import { ByRole, Locator, LocatorExpression } from '../engine/locator.schema.js'
import { Observation } from '../engine/observation.schema.js'
import { NodeRef, SemanticNode } from '../engine/semantic-node.schema.js'
import { Message, ModelAnswer, ToolCall } from '../model/model.schema.js'
import { Count } from '../verdict/step-record.schema.js'

const SecretText = Schema.Union([Schema.String, Schema.Struct({ secret: Schema.String })])

const TapArguments = Schema.Struct({ ref: Schema.String }).annotate({
  description: 'The [ref] of the node to tap.',
})
const FillArguments = Schema.Struct({ ref: Schema.String, value: SecretText }).annotate({
  description: 'The [ref] of the field, and the text to fill, or {"secret":"<name>"} for a secret param.',
})
const TypeArguments = Schema.Struct({ ref: Schema.String, text: Schema.String }).annotate({
  description: 'The [ref] of the field, and the text to type into it.',
})
const PressArguments = Schema.Struct({ ref: Schema.String, key: Schema.String }).annotate({
  description: 'The [ref] of the control, and the key to press, such as Enter or Tab.',
})
const SelectArguments = Schema.Struct({ ref: Schema.String, label: Schema.String }).annotate({
  description: 'The [ref] of the dropdown, and the label of the option to select.',
})
const CheckArguments = Schema.Struct({ ref: Schema.String, checked: Schema.Boolean }).annotate({
  description: 'The [ref] of the checkbox, and whether it should be checked.',
})
const HoverArguments = Schema.Struct({ ref: Schema.String }).annotate({
  description: 'The [ref] of the node to hover.',
})
const DragArguments = Schema.Struct({ from: Schema.String, to: Schema.String }).annotate({
  description: 'The [ref] of the node to drag from, and the [ref] of the node to drop on.',
})
const PointArguments = Schema.Struct({ x: Schema.Finite, y: Schema.Finite }).annotate({
  description: 'The viewport point to act at.',
})
const TypeAtArguments = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, text: SecretText }).annotate({
  description: 'The viewport point, and the text to type, or {"secret":"<name>"} for a secret param.',
})
const WaitForArguments = Schema.Struct({ ref: Schema.String, state: WaitState, timeout: Schema.Int }).annotate({
  description: 'The [ref] of the node, the state to wait for, and the timeout in milliseconds.',
})
const ScreenshotArguments = Schema.Struct({}).annotate({
  description: 'No arguments.',
})
const DoneArguments = Schema.Struct({ summary: Schema.String }).annotate({
  description: 'A one-sentence summary of what was achieved.',
})

const tapTool = Schema.Struct({ name: Schema.Literal('tap'), arguments: TapArguments }).annotate({
  description: 'Tap a control on the current screen.',
})
const fillTool = Schema.Struct({ name: Schema.Literal('fill'), arguments: FillArguments }).annotate({
  description: 'Fill a text field with text or a named secret.',
})
const typeTool = Schema.Struct({ name: Schema.Literal('type'), arguments: TypeArguments }).annotate({
  description: 'Type text into a control, key by key.',
})
const pressTool = Schema.Struct({ name: Schema.Literal('press'), arguments: PressArguments }).annotate({
  description: 'Press a key while a control is focused.',
})
const selectTool = Schema.Struct({ name: Schema.Literal('select'), arguments: SelectArguments }).annotate({
  description: 'Select an option of a dropdown by its label.',
})
const checkTool = Schema.Struct({ name: Schema.Literal('check'), arguments: CheckArguments }).annotate({
  description: 'Check or uncheck a checkbox.',
})
const hoverTool = Schema.Struct({ name: Schema.Literal('hover'), arguments: HoverArguments }).annotate({
  description: 'Hover a control on the current screen.',
})
const dragTool = Schema.Struct({ name: Schema.Literal('drag'), arguments: DragArguments }).annotate({
  description: 'Drag from one control to another.',
  capability: 'drag',
})
const tapAtTool = Schema.Struct({ name: Schema.Literal('tap_at'), arguments: PointArguments }).annotate({
  description: 'Tap a point of the viewport.',
  capability: 'web',
})
const typeAtTool = Schema.Struct({ name: Schema.Literal('type_at'), arguments: TypeAtArguments }).annotate({
  description: 'Type text at a point of the viewport.',
  capability: 'web',
})
const waitForTool = Schema.Struct({ name: Schema.Literal('wait_for'), arguments: WaitForArguments }).annotate({
  description: 'Wait until a control reaches a state.',
})
const screenshotTool = Schema.Struct({ name: Schema.Literal('screenshot'), arguments: ScreenshotArguments }).annotate({
  description: 'Capture a screenshot of the current screen.',
  capability: 'screenshot',
})
const doneTool = Schema.Struct({ name: Schema.Literal('done'), arguments: DoneArguments }).annotate({
  description: 'Finish the step: the goal is met.',
})

/** The ONE source of act tool name, arguments, description and required capability. */
export const ActTool = Schema.Union([
  tapTool,
  fillTool,
  typeTool,
  pressTool,
  selectTool,
  checkTool,
  hoverTool,
  dragTool,
  tapAtTool,
  typeAtTool,
  waitForTool,
  screenshotTool,
  doneTool,
])
export type ActTool = typeof ActTool.Type

const NextActDecisionTypeId: unique symbol = Symbol.for('@systemfsoftware/effect-e2e/NextActDecision')
type NextActDecisionTypeId = typeof NextActDecisionTypeId

export class Execute extends Schema.TaggedClass<Execute>()('Execute', {
  callId: Schema.String,
  action: Action,
  located: Schema.Array(NodeRef),
  controls: Schema.Array(ControlDescriptor),
}) {
  readonly [NextActDecisionTypeId] = NextActDecisionTypeId
}

export class Capture extends Schema.TaggedClass<Capture>()('Capture', { callId: Schema.String }) {
  readonly [NextActDecisionTypeId] = NextActDecisionTypeId
}

export class Done extends Schema.TaggedClass<Done>()('Done', {
  callId: Schema.String,
  summary: Schema.String,
}) {
  readonly [NextActDecisionTypeId] = NextActDecisionTypeId
}

export class Correct extends Schema.TaggedClass<Correct>()('Correct', { reply: Message }) {
  readonly [NextActDecisionTypeId] = NextActDecisionTypeId
}

export class Exhausted extends Schema.TaggedClass<Exhausted>()('Exhausted', {
  budget: Schema.Literals(['steps', 'model-calls']),
}) {
  readonly [NextActDecisionTypeId] = NextActDecisionTypeId
}

export class Unsupported extends Schema.TaggedClass<Unsupported>()('Unsupported', {
  callId: Schema.String,
  capability: EngineCapability,
}) {
  readonly [NextActDecisionTypeId] = NextActDecisionTypeId
}

export const NextActDecision = Schema.Union([Execute, Capture, Done, Correct, Exhausted, Unsupported])
export type NextActDecision = typeof NextActDecision.Type

export class NextAct extends Schema.TaggedClass<NextAct>()('NextAct', {
  answer: ModelAnswer,
  observation: Observation,
  capabilities: Schema.Array(EngineCapability),
  secrets: Schema.Array(Schema.String),
  steps: Count,
  maxSteps: Count,
  modelCalls: Count,
  maxModelCalls: Count,
}) {
  static readonly [Workflow.InstrumentationBrand] = {
    steps: 'app.e2e.agent.steps',
    modelCalls: 'app.e2e.agent.model-calls',
  } as const
}

const TEXT_ANSWER_CONTENT =
  'reply with exactly one tool call: name the tool for the next action, or call done when the goal is met'

const absentRefContent = (ref: string): string =>
  `ref "${ref}" is not a visible node on the current screen; target a node by the [ref] shown on the current screen`

const unknownToolContent = (name: string): string => `unknown tool "${name}"; call one of the listed tools`

const malformedArgumentsContent = (name: string): string => `the arguments for "${name}" do not match its schema`

const unknownSecretContent = (name: string): string =>
  `the secret "${name}" is not a param of this step; fill only a secret the task names, as {"secret":"<name>"}`

const roleMissingContent = (id: string): string => `node "${id}" has no role, so it cannot be targeted`

interface ToolMember {
  readonly name: string
  readonly arguments: Schema.Constraint
  readonly capability: Option.Option<EngineCapability>
}

const unionMembersOf = (ast: SchemaAST.AST): ReadonlyArray<SchemaAST.AST> =>
  Match.value(ast).pipe(
    Match.tag('Union', (union) => union.types),
    Match.orElse((): ReadonlyArray<SchemaAST.AST> => []),
  )

const signatureNamed = (member: SchemaAST.AST, key: string): Option.Option<SchemaAST.PropertySignature> =>
  Match.value(member).pipe(
    Match.tag('Objects', (objects) => Arr.findFirst(objects.propertySignatures, (ps) => ps.name === key)),
    Match.orElse(() => Option.none()),
  )

const literalStringOf = (ast: SchemaAST.AST): Option.Option<string> =>
  Match.value(ast).pipe(
    Match.tag('Literal', (literal) =>
      Match.value(literal.literal).pipe(
        Match.when(Predicate.isString, (value) => Option.some(value)),
        Match.orElse(() => Option.none()),
      )),
    Match.orElse(() => Option.none()),
  )

const toolNameOf = (member: SchemaAST.AST): Option.Option<string> =>
  Option.flatMap(signatureNamed(member, 'name'), (signature) => literalStringOf(signature.type))

const argumentsAstOf = (member: SchemaAST.AST): Option.Option<SchemaAST.AST> =>
  Option.map(signatureNamed(member, 'arguments'), (signature) => signature.type)

const annotationsOf = (member: SchemaAST.AST): Option.Option<Schema.Annotations.Annotations> =>
  Match.value(member).pipe(
    Match.tag('Objects', (objects) => Option.fromNullishOr(objects.annotations)),
    Match.orElse(() => Option.none()),
  )

const capabilityOf = (member: SchemaAST.AST): Option.Option<EngineCapability> =>
  Option.flatMap(
    annotationsOf(member),
    (present) => Option.filter(Option.some(present['capability']), Schema.is(EngineCapability)),
  )

const toolMemberOf = (member: SchemaAST.AST): Option.Option<ToolMember> =>
  Option.flatMap(toolNameOf(member), (name) =>
    Option.map(argumentsAstOf(member), (args) => ({
      name,
      arguments: Schema.make(args),
      capability: capabilityOf(member),
    })))

const toolMembers: ReadonlyArray<ToolMember> = Arr.flatMap(
  unionMembersOf(ActTool.ast),
  (member) =>
    Option.match(toolMemberOf(member), {
      onNone: () => [],
      onSome: (toolMember) => [toolMember],
    }),
)

const memberNamed = (name: string): Option.Option<ToolMember> =>
  Arr.findFirst(toolMembers, (member) => member.name === name)

interface Placement {
  readonly node: SemanticNode
  readonly chain: ReadonlyArray<SemanticNode>
}

const placementsOf = (
  forest: ReadonlyArray<SemanticNode>,
  chain: ReadonlyArray<SemanticNode>,
): ReadonlyArray<Placement> => Arr.flatMap(forest, (node) => placementsUnder(node, chain))

const visibleOf = (node: SemanticNode): Option.Option<SemanticNode> =>
  Option.filter(Option.some(node), () => !node.states.hidden)

const placementsUnder = (node: SemanticNode, chain: ReadonlyArray<SemanticNode>): ReadonlyArray<Placement> =>
  Option.match(visibleOf(node), {
    onNone: () => [],
    onSome: (visible) => [
      { node: visible, chain },
      ...placementsOf(visible.children, Arr.append(chain, visible)),
    ],
  })

const placementOfRef = (placements: ReadonlyArray<Placement>, ref: string): Option.Option<Placement> =>
  Arr.findFirst(placements, (placement) => placement.node.ref.id === ref)

const nameOf = (node: SemanticNode): ReadonlyArray<string> =>
  Option.match(Option.fromNullishOr(node.name), {
    onNone: () => [],
    onSome: (name) => [name],
  })

const namedAncestorsOf = (chain: ReadonlyArray<SemanticNode>): ReadonlyArray<string> => Arr.flatMap(chain, nameOf)

interface ResolvedTarget {
  readonly locator: Locator
  readonly located: ReadonlyArray<NodeRef>
  readonly controls: ReadonlyArray<ControlDescriptor>
}

interface ActionPlan {
  readonly action: Action
  readonly located: ReadonlyArray<NodeRef>
  readonly controls: ReadonlyArray<ControlDescriptor>
}

const baseExpressionOf = (role: string, name: Option.Option<string>): ByRole =>
  Option.match(name, {
    onNone: () => ({ kind: 'ByRole', role }),
    onSome: (value) => ({ kind: 'ByRole', role, name: { value, exact: true } }),
  })

const nameMatches = (name: Option.Option<string>) => (other: Placement): boolean =>
  Option.match(name, {
    onNone: () => true,
    onSome: (value) => other.node.name === value,
  })

const sameTargetAs = (role: string, name: Option.Option<string>) => (other: Placement): boolean =>
  Arr.every([other.node.role === role, nameMatches(name)(other)], (holds) => holds)

// the placement is always among its own candidates, so the fallback is unreachable
const indexAmong = (
  candidates: ReadonlyArray<Placement>,
  placement: Placement,
): number =>
  Option.getOrElse(
    Arr.findFirstIndex(candidates, (candidate) => candidate.node.ref.id === placement.node.ref.id),
    () => 0,
  )

const expressionOf = (
  placements: ReadonlyArray<Placement>,
  placement: Placement,
  role: string,
  name: Option.Option<string>,
  base: ByRole,
): LocatorExpression => {
  const candidates = Arr.filter(placements, sameTargetAs(role, name))
  return Match.value(candidates.length > 1).pipe(
    Match.when(true, (): LocatorExpression => ({ kind: 'Nth', inner: base, index: indexAmong(candidates, placement) })),
    Match.when(false, (): LocatorExpression => base),
    Match.exhaustive,
  )
}

const labelOf = (role: string, name: Option.Option<string>): string =>
  Option.match(name, {
    onNone: () => role,
    onSome: (value) => `${role} "${value}"`,
  })

const locatorOf = (placements: ReadonlyArray<Placement>, placement: Placement, role: string): Locator => {
  const name = Option.fromNullishOr(placement.node.name)
  return {
    expression: expressionOf(placements, placement, role, name, baseExpressionOf(role, name)),
    label: labelOf(role, name),
  }
}

const controlOf = (placement: Placement, role: string): ControlDescriptor =>
  Option.match(Option.fromNullishOr(placement.node.name), {
    onNone: () => ({ role, context: namedAncestorsOf(placement.chain) }),
    onSome: (name) => ({ role, name, context: namedAncestorsOf(placement.chain) }),
  })

const targetOf = (placements: ReadonlyArray<Placement>, placement: Placement, role: string): ResolvedTarget => ({
  locator: locatorOf(placements, placement, role),
  located: [placement.node.ref],
  controls: [controlOf(placement, role)],
})

const modelCallGated = (command: NextAct, decision: NextActDecision): NextActDecision =>
  Match.value(command.modelCalls < command.maxModelCalls).pipe(
    Match.when(true, () => decision),
    Match.when(false, () => new Exhausted({ budget: 'model-calls' })),
    Match.exhaustive,
  )

const correctedOf = (command: NextAct, reply: Message): NextActDecision =>
  modelCallGated(command, new Correct({ reply }))

const textCorrected = (command: NextAct): NextActDecision =>
  correctedOf(command, { _tag: 'UserMessage', content: [{ _tag: 'TextPart', text: TEXT_ANSWER_CONTENT }] })

const toolCorrected = (command: NextAct, callId: string, content: string): NextActDecision =>
  correctedOf(command, { _tag: 'ToolMessage', toolCallId: callId, content })

const captureOf = (command: NextAct, call: ToolCall): NextActDecision =>
  modelCallGated(command, new Capture({ callId: call.id }))

const callGatedExecute = (command: NextAct, call: ToolCall, plan: ActionPlan): NextActDecision =>
  Match.value(command.modelCalls < command.maxModelCalls).pipe(
    Match.when(true, (): NextActDecision =>
      new Execute({
        callId: call.id,
        action: plan.action,
        located: plan.located,
        controls: plan.controls,
      })),
    Match.when(false, (): NextActDecision => new Exhausted({ budget: 'model-calls' })),
    Match.exhaustive,
  )

const executeOf = (command: NextAct, call: ToolCall, plan: ActionPlan): NextActDecision =>
  Match.value(command.steps >= command.maxSteps).pipe(
    Match.when(true, (): NextActDecision => new Exhausted({ budget: 'steps' })),
    Match.when(false, () => callGatedExecute(command, call, plan)),
    Match.exhaustive,
  )

const singlePlanOf = (target: ResolvedTarget, actionOf: (locator: Locator) => Action): ActionPlan => ({
  action: actionOf(target.locator),
  located: target.located,
  controls: target.controls,
})

const roleDecision = (
  command: NextAct,
  call: ToolCall,
  placements: ReadonlyArray<Placement>,
  placement: Placement,
  actionOf: (locator: Locator) => Action,
): NextActDecision =>
  Option.match(Option.fromNullishOr(placement.node.role), {
    onNone: () => toolCorrected(command, call.id, roleMissingContent(placement.node.ref.id)),
    onSome: (role) => executeOf(command, call, singlePlanOf(targetOf(placements, placement, role), actionOf)),
  })

const refDecision = (
  command: NextAct,
  call: ToolCall,
  ref: string,
  actionOf: (locator: Locator) => Action,
): NextActDecision => {
  const placements = placementsOf(command.observation.tree, [])
  return Option.match(placementOfRef(placements, ref), {
    onNone: () => toolCorrected(command, call.id, absentRefContent(ref)),
    onSome: (placement) => roleDecision(command, call, placements, placement, actionOf),
  })
}

const secretRefDecision = (
  command: NextAct,
  call: ToolCall,
  ref: string,
  name: string,
  actionOf: (locator: Locator) => Action,
): NextActDecision =>
  Match.value(Arr.contains(command.secrets, name)).pipe(
    Match.when(true, () => refDecision(command, call, ref, actionOf)),
    Match.when(false, () => toolCorrected(command, call.id, unknownSecretContent(name))),
    Match.exhaustive,
  )

const fillDecision = (command: NextAct, call: ToolCall, ref: string, value: ActToolArguments): NextActDecision =>
  Match.value(value).pipe(
    Match.when(
      Predicate.isString,
      (text) => refDecision(command, call, ref, (target) => ({ _tag: 'Fill', target, value: text })),
    ),
    Match.orElse((secretRef: { secret: string }) =>
      secretRefDecision(command, call, ref, secretRef.secret, (target) => ({
        _tag: 'Fill',
        target,
        value: { secret: secretRef.secret },
      }))
    ),
  )

type ActToolArguments = string | { secret: string }

const pointPlanOf = (x: number, y: number, actionOf: (point: { x: number; y: number }) => Action): ActionPlan => ({
  action: actionOf({ x, y }),
  located: [],
  controls: [],
})

const typeAtDecision = (
  command: NextAct,
  call: ToolCall,
  args: { x: number; y: number; text: ActToolArguments },
): NextActDecision =>
  Match.value(args.text).pipe(
    Match.when(Predicate.isString, (text) =>
      executeOf(command, call, pointPlanOf(args.x, args.y, (point) => ({ _tag: 'TypeAt', point, text })))),
    Match.orElse((secretRef: { secret: string }) =>
      Match.value(Arr.contains(command.secrets, secretRef.secret)).pipe(
        Match.when(true, () =>
          executeOf(
            command,
            call,
            pointPlanOf(args.x, args.y, (point) => ({
              _tag: 'TypeAt',
              point,
              text: { secret: secretRef.secret },
            })),
          )),
        Match.when(false, () =>
          toolCorrected(command, call.id, unknownSecretContent(secretRef.secret))),
        Match.exhaustive,
      )
    ),
  )

const dragPlanOf = (from: ResolvedTarget, to: ResolvedTarget): ActionPlan => ({
  action: { _tag: 'Drag', from: from.locator, to: to.locator },
  located: [...from.located, ...to.located],
  controls: [...from.controls, ...to.controls],
})

const targetOfPlacement = (placements: ReadonlyArray<Placement>, placement: Placement): Option.Option<ResolvedTarget> =>
  Option.map(Option.fromNullishOr(placement.node.role), (role) => targetOf(placements, placement, role))

const rolelessIdOf = (from: Placement, to: Placement): string =>
  Match.value(Option.fromNullishOr(from.node.role)).pipe(
    Match.when(Option.isNone, () => from.node.ref.id),
    Match.orElse(() => to.node.ref.id),
  )

const dragTargetsDecision = (
  command: NextAct,
  call: ToolCall,
  placements: ReadonlyArray<Placement>,
  from: Placement,
  to: Placement,
): NextActDecision =>
  Option.match(Option.all([targetOfPlacement(placements, from), targetOfPlacement(placements, to)]), {
    onNone: () => toolCorrected(command, call.id, roleMissingContent(rolelessIdOf(from, to))),
    onSome: ([fromTarget, toTarget]) => executeOf(command, call, dragPlanOf(fromTarget, toTarget)),
  })

const dragDecision = (command: NextAct, call: ToolCall, fromRef: string, toRef: string): NextActDecision => {
  const placements = placementsOf(command.observation.tree, [])
  return Option.match(placementOfRef(placements, fromRef), {
    onNone: () => toolCorrected(command, call.id, absentRefContent(fromRef)),
    onSome: (from) =>
      Option.match(placementOfRef(placements, toRef), {
        onNone: () => toolCorrected(command, call.id, absentRefContent(toRef)),
        onSome: (to) => dragTargetsDecision(command, call, placements, from, to),
      }),
  })
}

const toolDecision = (command: NextAct, call: ToolCall, tool: ActTool): NextActDecision =>
  Match.value(tool).pipe(
    Match.discriminatorsExhaustive('name')({
      tap: ({ arguments: args }) => refDecision(command, call, args.ref, (target) => ({ _tag: 'Tap', target })),
      fill: ({ arguments: args }) => fillDecision(command, call, args.ref, args.value),
      type: ({ arguments: args }) =>
        refDecision(command, call, args.ref, (target) => ({ _tag: 'Type', target, text: args.text })),
      press: ({ arguments: args }) =>
        refDecision(command, call, args.ref, (target) => ({ _tag: 'Press', target, key: args.key })),
      select: ({ arguments: args }) =>
        refDecision(command, call, args.ref, (target) => ({
          _tag: 'Select',
          target,
          option: { _tag: 'ByLabel', label: args.label },
        })),
      check: ({ arguments: args }) =>
        refDecision(command, call, args.ref, (target) => ({ _tag: 'Check', target, checked: args.checked })),
      hover: ({ arguments: args }) => refDecision(command, call, args.ref, (target) => ({ _tag: 'Hover', target })),
      drag: ({ arguments: args }) => dragDecision(command, call, args.from, args.to),
      tap_at: ({ arguments: args }) =>
        executeOf(command, call, pointPlanOf(args.x, args.y, (point) => ({ _tag: 'TapAt', point }))),
      type_at: ({ arguments: args }) => typeAtDecision(command, call, args),
      wait_for: ({ arguments: args }) =>
        refDecision(command, call, args.ref, (target) => ({
          _tag: 'WaitFor',
          locator: target,
          state: args.state,
          timeout: args.timeout,
        })),
      screenshot: () => captureOf(command, call),
      done: ({ arguments: args }) => new Done({ callId: call.id, summary: args.summary }),
    }),
  )

const decodedDecision = (command: NextAct, call: ToolCall, name: string): NextActDecision =>
  Result.match(Schema.decodeUnknownResult(ActTool)({ name: call.name, arguments: call.arguments }), {
    onFailure: () => toolCorrected(command, call.id, malformedArgumentsContent(name)),
    onSuccess: (tool) => toolDecision(command, call, tool),
  })

const capabilityDecision = (command: NextAct, call: ToolCall, member: ToolMember): NextActDecision =>
  Option.match(member.capability, {
    onNone: () => decodedDecision(command, call, member.name),
    onSome: (required) =>
      Match.value(Arr.contains(command.capabilities, required)).pipe(
        Match.when(true, () => decodedDecision(command, call, member.name)),
        Match.when(false, () => new Unsupported({ callId: call.id, capability: required })),
        Match.exhaustive,
      ),
  })

const callDecision = (command: NextAct, call: ToolCall): NextActDecision =>
  Option.match(memberNamed(call.name), {
    onNone: () => toolCorrected(command, call.id, unknownToolContent(call.name)),
    onSome: (member) => capabilityDecision(command, call, member),
  })

const answerDecision = (command: NextAct): NextActDecision =>
  Match.valueTags(command.answer, {
    Text: () => textCorrected(command),
    ToolCalls: ({ calls }) => callDecision(command, Arr.headNonEmpty(calls)),
  })

export const nextAct = Workflow.make({
  command: NextAct,
  decision: NextActDecision,
  error: Schema.Never,
  decide: (command): Result.Result<NextActDecision, never> => Result.succeed(answerDecision(command)),
})
