import * as Arr from 'effect/Array'
import * as Function from 'effect/Function'
import * as JsonSchema from 'effect/JsonSchema'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Order from 'effect/Order'
import * as Predicate from 'effect/Predicate'
import * as Schema from 'effect/Schema'
import * as SchemaAST from 'effect/SchemaAST'
import * as Str from 'effect/String'

import type { StepParams } from '../cache/key.schema.js'
import { SecretRef } from '../Config/names.schema.js'
import { Unique } from '../Config/values.schema.js'
import type { Action, CredentialPasswordRef, FillValue, SelectOption } from '../engine/action.schema.js'
import { EngineCapability } from '../engine/capability.schema.js'
import type { Message, ModelAnswer, ModelRequest, ToolCall, ToolDefinition } from '../model/model.schema.js'
import { ActTool } from './next-act.workflow.js'

export const ACT_MAX_OUTPUT_TOKENS = 1024

const ACT_FRAMEWORK_SYSTEM = [
  'You drive a real app through its UI to reach one goal.',
  'Act with exactly one tool call per turn.',
  'Target nodes by the [ref] shown beside each node on the current screen.',
  'Never type a secret value: fill it with {"secret":"<name>"}.',
  'When the goal is met, call done with a one-sentence summary.',
].join('\n')

const SKIPPED_CONTENT = 'not run: one action per turn'

const DEFS_PREFIX = '#/$defs/'

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value)

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject => Predicate.isObject(value)

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

const descriptionOf = (member: SchemaAST.AST): Option.Option<string> =>
  Option.flatMap(
    annotationsOf(member),
    (present) => Option.filter(Option.some(present['description']), Predicate.isString),
  )

const definitionNamed = (definitions: JsonSchema.Definitions, ref: string): Option.Option<Schema.JsonObject> =>
  Match.value(ref.startsWith(DEFS_PREFIX)).pipe(
    Match.when(true, () => Schema.decodeUnknownOption(Schema.JsonObject)(definitions[ref.slice(DEFS_PREFIX.length)])),
    Match.when(false, () => Option.none()),
    Match.exhaustive,
  )

const refDefinitionOf = (
  definitions: JsonSchema.Definitions,
  ref: Schema.Json | undefined,
): Option.Option<Schema.JsonObject> =>
  Option.flatMap(
    Match.value(ref).pipe(
      Match.when(Predicate.isString, (value) => Option.some(value)),
      Match.orElse(() => Option.none()),
    ),
    (value) => definitionNamed(definitions, value),
  )

const withoutRef = (record: Schema.JsonObject): Schema.JsonObject =>
  Object.fromEntries(Object.entries(record).filter(([key]) => key !== '$ref'))

const mergedRecordOf = (definition: Schema.JsonObject, record: Schema.JsonObject): Schema.JsonObject =>
  Object.fromEntries([...Object.entries(definition), ...Object.entries(record)])

const resolvedRecordOf = (definitions: JsonSchema.Definitions, record: Schema.JsonObject): Schema.JsonObject =>
  Option.match(refDefinitionOf(definitions, record['$ref']), {
    onNone: () => record,
    onSome: (definition) => mergedRecordOf(definition, withoutRef(record)),
  })

const recordInlinedOf = (definitions: JsonSchema.Definitions, record: Schema.JsonObject): Schema.JsonObject =>
  Object.fromEntries(
    Object.entries(resolvedRecordOf(definitions, record)).map(([key, value]) => [key, inlinedOf(definitions, value)]),
  )

const inlinedOf = (definitions: JsonSchema.Definitions, node: Schema.Json): Schema.Json =>
  Match.value(node).pipe(
    Match.when(isJsonArray, (items) => items.map((item) => inlinedOf(definitions, item))),
    Match.when(isJsonObject, (record) => recordInlinedOf(definitions, record)),
    Match.orElse((leaf) => leaf),
  )

const inlinedObjectOf = (
  definitions: JsonSchema.Definitions,
  node: Schema.JsonObject,
): Option.Option<Schema.JsonObject> =>
  Match.value(inlinedOf(definitions, node)).pipe(
    Match.when(isJsonObject, (record) => Option.some(mergedRecordOf({ type: 'object' }, record))),
    Match.orElse(() => Option.none()),
  )

const parametersOf = (args: Schema.Constraint): Option.Option<Schema.JsonObject> => {
  const document = Schema.toJsonSchemaDocument(args)
  return Option.flatMap(
    Schema.decodeUnknownOption(Schema.JsonObject)(document.schema),
    (schema) => inlinedObjectOf(document.definitions, schema),
  )
}

const parametersOfMember = (member: SchemaAST.AST): Option.Option<Schema.JsonObject> =>
  Option.flatMap(argumentsAstOf(member), (args) => parametersOf(Schema.make(args)))

const declaresCapability = (capabilities: ReadonlyArray<EngineCapability>) => (member: SchemaAST.AST): boolean =>
  Option.match(capabilityOf(member), {
    onNone: () => true,
    onSome: (required) => Arr.contains(capabilities, required),
  })

const definitionOf =
  (capabilities: ReadonlyArray<EngineCapability>) => (member: SchemaAST.AST): Option.Option<ToolDefinition> =>
    Option.filter(
      Option.flatMap(
        toolNameOf(member),
        (name) =>
          Option.flatMap(
            descriptionOf(member),
            (description) =>
              Option.map(parametersOfMember(member), (parameters) => ({ name, description, parameters })),
          ),
      ),
      () => declaresCapability(capabilities)(member),
    )

const actToolMembers: ReadonlyArray<SchemaAST.AST> = unionMembersOf(ActTool.ast)

export const actTools = (capabilities: ReadonlyArray<EngineCapability>): ReadonlyArray<ToolDefinition> =>
  Arr.flatMap(actToolMembers, (member) =>
    Option.match(definitionOf(capabilities)(member), {
      onNone: () => [],
      onSome: (definition) => [definition],
    }))

export const systemPromptOf = (agentSystem: string): string =>
  Match.value(agentSystem.length === 0).pipe(
    Match.when(true, () => ACT_FRAMEWORK_SYSTEM),
    Match.when(false, () => `${ACT_FRAMEWORK_SYSTEM}\n\n${agentSystem}`),
    Match.exhaustive,
  )

const contextLinesOf = (context: string): ReadonlyArray<string> =>
  Match.value(context.length === 0).pipe(
    Match.when(true, () => []),
    Match.when(false, () => [context]),
    Match.exhaustive,
  )

const byParamName = Order.mapInput(Str.Order, ([name]: readonly [string, StepParams[keyof StepParams]]) => name)

const paramLineOf = ([name, value]: readonly [string, StepParams[keyof StepParams]]): string =>
  Match.value(value).pipe(
    Match.when(Schema.is(Unique), (unique) => `- ${name}: ${JSON.stringify(unique.value)}`),
    Match.when(
      Schema.is(SecretRef),
      (ref) => `- ${name}: secret "${ref.secret}", value withheld; fill it with {"secret":"${ref.secret}"}`,
    ),
    Match.orElse((json) => `- ${name}: ${JSON.stringify(json)}`),
  )

const paramLinesOf = (params: StepParams): ReadonlyArray<string> =>
  Arr.map(Arr.sort(Object.entries(params), byParamName), paramLineOf)

const replayedLinesOf = (replayed: ReadonlyArray<Action>): ReadonlyArray<string> =>
  Match.value(replayed.length === 0).pipe(
    Match.when(true, () => []),
    Match.when(false, () => [
      'Already done (replayed from a recording):',
      ...Arr.map(replayed, (action) => `- ${describeAction(action)}`),
    ]),
    Match.exhaustive,
  )

const taskTextOf = (task: {
  readonly context: string
  readonly instruction: string
  readonly params: StepParams
  readonly replayed: ReadonlyArray<Action>
}): string =>
  [
    ...contextLinesOf(task.context),
    `Goal: ${task.instruction}`,
    'Params:',
    ...paramLinesOf(task.params),
    ...replayedLinesOf(task.replayed),
  ].join('\n')

export const taskMessageOf = (task: {
  readonly context: string
  readonly instruction: string
  readonly params: StepParams
  readonly replayed: ReadonlyArray<Action>
}): Message => ({
  _tag: 'UserMessage',
  content: [{ _tag: 'TextPart', text: taskTextOf(task) }],
})

export const assistantMessageOf = (answer: ModelAnswer): Message =>
  Match.valueTags(answer, {
    ToolCalls: ({ calls }): Message => ({ _tag: 'AssistantMessage', text: '', toolCalls: calls }),
    Text: ({ text }): Message => ({ _tag: 'AssistantMessage', text, toolCalls: [] }),
  })

export const toolResultOf: {
  (callId: string, content: string): Message
  (callId: string): (content: string) => Message
} = Function.dual(2, (callId: string, content: string): Message => ({
  _tag: 'ToolMessage',
  toolCallId: callId,
  content,
}))

const skippedReplyOf = (answeredId: string) => (call: ToolCall): ReadonlyArray<Message> =>
  Match.value(call.id === answeredId).pipe(
    Match.when(true, () => []),
    Match.when(false, () => [toolResultOf(call.id, SKIPPED_CONTENT)]),
    Match.exhaustive,
  )

export const skippedRepliesOf: {
  (answer: ModelAnswer, answeredId: string): ReadonlyArray<Message>
  (answer: ModelAnswer): (answeredId: string) => ReadonlyArray<Message>
} = Function.dual(2, (answer: ModelAnswer, answeredId: string): ReadonlyArray<Message> =>
  Match.valueTags(answer, {
    Text: () => [],
    ToolCalls: ({ calls }) => Arr.flatMap(calls, skippedReplyOf(answeredId)),
  }))

export const observationMessageOf: {
  (formatted: string, screenshot: Option.Option<string>): Message
  (formatted: string): (screenshot: Option.Option<string>) => Message
} = Function.dual(2, (formatted: string, screenshot: Option.Option<string>): Message =>
  Option.match(screenshot, {
    onNone: (): Message => ({
      _tag: 'UserMessage',
      content: [{ _tag: 'TextPart', text: `Current screen:\n${formatted}` }],
    }),
    onSome: (data): Message => ({
      _tag: 'UserMessage',
      content: [
        { _tag: 'TextPart', text: `Current screen:\n${formatted}` },
        { _tag: 'ImagePart', mediaType: 'image/png', data },
      ],
    }),
  }))

const fillValueTextOf = (value: FillValue): string =>
  Match.value(value).pipe(
    Match.when(Predicate.isString, (text) => JSON.stringify(text)),
    Match.when(Schema.is(SecretRef), (ref) => `secret "${ref.secret}"`),
    Match.orElse((credential: CredentialPasswordRef) => `credential "${credential.credential}"`),
  )

const optionTextOf = (option: SelectOption): string =>
  Match.valueTags(option, {
    ByValue: ({ value }) => `the option with value ${JSON.stringify(value)}`,
    ByLabel: ({ label }) => `the option labeled ${JSON.stringify(label)}`,
  })

export const describeAction = (action: Action): string =>
  Match.valueTags(action, {
    Navigate: ({ url }) => `navigate to ${url}`,
    Tap: ({ target }) => `tap ${target.label}`,
    Fill: ({ target, value }) => `fill ${target.label} with ${fillValueTextOf(value)}`,
    Type: ({ target, text }) => `type ${JSON.stringify(text)} into ${target.label}`,
    Press: ({ target, key }) => `press ${key} on ${target.label}`,
    Select: ({ target, option }) => `select ${target.label} with ${optionTextOf(option)}`,
    Check: ({ target, checked }) => `${checked ? 'check' : 'uncheck'} ${target.label}`,
    Hover: ({ target }) => `hover ${target.label}`,
    Drag: ({ from, to }) => `drag ${from.label} to ${to.label}`,
    Swipe: ({ direction }) => `swipe ${direction}`,
    SwipePath: ({ path }) => `swipe along a path of ${path.length} points`,
    TapAt: ({ point }) => `tap at (${point.x}, ${point.y})`,
    TypeAt: ({ point, text }) => `type ${fillValueTextOf(text)} at (${point.x}, ${point.y})`,
    Screenshot: ({ label }) => `take screenshot ${label}`,
    WaitFor: ({ locator, state }) => `wait for ${locator.label} to be ${state}`,
  })

export const actRequestOf = (request: {
  readonly model: string
  readonly system: string
  readonly messages: ReadonlyArray<Message>
  readonly tools: ReadonlyArray<ToolDefinition>
}): ModelRequest => ({
  model: request.model,
  system: request.system,
  messages: [...request.messages],
  tools: [...request.tools],
  toolChoice: { _tag: 'AutoTool' },
  temperature: 0,
  maxOutputTokens: ACT_MAX_OUTPUT_TOKENS,
})
