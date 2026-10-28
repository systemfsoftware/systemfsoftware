import { it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import { SecretRef } from '../../Config/names.schema.js'
import { Unique } from '../../Config/values.schema.js'
import type { Action } from '../../engine/action.schema.js'
import { EngineCapability } from '../../engine/capability.schema.js'
import type { Locator } from '../../engine/locator.schema.js'
import type { Observation } from '../../engine/observation.schema.js'
import type { Route } from '../../engine/route.schema.js'
import { type SemanticNode } from '../../engine/semantic-node.schema.js'
import type { ContentPart, Message, ModelAnswer, ToolCall } from '../../model/model.schema.js'
import { actTools, describeAction, taskMessageOf } from '../act-prompt.js'
import { NextAct, nextAct, type NextActDecision } from '../next-act.workflow.js'

const HOME: Route = { origin: 'https://app.example.test', path: '/home', query: [] }

const ALL_CAPABILITIES: ReadonlyArray<EngineCapability> = ['web', 'screenshot', 'navigation-timing', 'drag']

const observationOf = (tree: ReadonlyArray<SemanticNode>): Observation => ({ route: HOME, revision: 'rev', tree })

const nodeOf = (
  id: string,
  role: string | undefined,
  name: string | undefined,
  hidden: boolean,
  children: ReadonlyArray<SemanticNode>,
): SemanticNode => ({
  ref: { id, revision: 'rev' },
  states: { disabled: false, hidden },
  ...(role === undefined ? {} : { role }),
  ...(name === undefined ? {} : { name }),
  children,
})

const chainOf = (names: ReadonlyArray<string>, leaf: SemanticNode): SemanticNode =>
  names.reduceRight((inner, name, index) => nodeOf(`anc-${String(index)}`, undefined, name, false, [inner]), leaf)

const callOf = (id: string, name: string, args: Schema.JsonObject): ToolCall => ({ id, name, arguments: args })

const toolAnswer = (first: ToolCall, ...rest: ReadonlyArray<ToolCall>): ModelAnswer => ({
  _tag: 'ToolCalls',
  calls: [first, ...rest],
})

const commandOf = (
  answer: ModelAnswer,
  observation: Observation,
  overrides: Partial<
    Pick<NextAct, 'capabilities' | 'secrets' | 'steps' | 'maxSteps' | 'modelCalls' | 'maxModelCalls'>
  >,
): NextAct =>
  new NextAct({
    answer,
    observation,
    capabilities: [...ALL_CAPABILITIES],
    secrets: ['pw'],
    steps: 0,
    maxSteps: 5,
    modelCalls: 1,
    maxModelCalls: 5,
    ...overrides,
  })

const decisionOf = (subject: typeof nextAct, command: NextAct): NextActDecision =>
  Result.match(subject(command), { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const isDoneWith = (decision: NextActDecision, callId: string, summary: string): boolean =>
  Match.value(decision).pipe(
    Match.tag('Done', (done) => done.callId === callId && done.summary === summary),
    Match.orElse(() => false),
  )

const isExhausted = (decision: NextActDecision, budget: 'steps' | 'model-calls'): boolean =>
  Match.value(decision).pipe(
    Match.tag('Exhausted', (exhausted) => exhausted.budget === budget),
    Match.orElse(() => false),
  )

const isCaptureOf = (decision: NextActDecision, callId: string): boolean =>
  Match.value(decision).pipe(
    Match.tag('Capture', (capture) => capture.callId === callId),
    Match.orElse(() => false),
  )

const isUnsupportedOf = (decision: NextActDecision, callId: string, capability: EngineCapability): boolean =>
  Match.value(decision).pipe(
    Match.tag('Unsupported', (unsupported) => unsupported.callId === callId && unsupported.capability === capability),
    Match.orElse(() => false),
  )

const isExecute = (
  decision: NextActDecision,
  callId: string,
  action: Action,
  located: ReadonlyArray<SemanticNode['ref']>,
  controls: ReadonlyArray<{ role?: string; name?: string; context: ReadonlyArray<string> }>,
): boolean =>
  Match.value(decision).pipe(
    Match.tag('Execute', (execute) =>
      execute.callId === callId &&
      JSON.stringify(execute.action) === JSON.stringify(action) &&
      JSON.stringify(execute.located) === JSON.stringify(located) &&
      JSON.stringify(execute.controls) === JSON.stringify(controls)),
    Match.orElse(() => false),
  )

const isTextual = (part: ContentPart): boolean =>
  Match.valueTags(part, {
    TextPart: (text) => text.text.length > 0,
    ImagePart: () => false,
  })

const isToolCorrectFor = (decision: NextActDecision, callId: string): boolean =>
  Match.value(decision).pipe(
    Match.tag('Correct', (correct) =>
      Match.valueTags(correct.reply, {
        ToolMessage: (message) => message.toolCallId === callId && message.content.length > 0,
        UserMessage: () => false,
        AssistantMessage: () => false,
      })),
    Match.orElse(() => false),
  )

const isUserCorrect = (decision: NextActDecision): boolean =>
  Match.value(decision).pipe(
    Match.tag('Correct', (correct) =>
      Match.valueTags(correct.reply, {
        UserMessage: (message) => message.content.length === 1 && isTextual(message.content[0]),
        ToolMessage: () => false,
        AssistantMessage: () => false,
      })),
    Match.orElse(() => false),
  )

const locatedRef = (id: string): SemanticNode['ref'] => ({ id, revision: 'rev' })

const byRole = (role: string, name: string): Locator => ({
  expression: { kind: 'ByRole', role, name: { value: name, exact: true } },
  label: `${role} "${name}"`,
})

it.prop(
  '∀t_NextAct_→DoneWhateverTheBudgets',
  { of: [Schema.String], subject: nextAct, arbitrary: { seed: 505_101 } },
  (subject, [summary]) => {
    const answer = toolAnswer(callOf('call-1', 'done', { summary }))
    const spent = { steps: 9, maxSteps: 9, modelCalls: 9, maxModelCalls: 9 }
    const decision = decisionOf(subject, commandOf(answer, observationOf([]), spent))
    return isDoneWith(decision, 'call-1', summary)
  },
)

it.prop(
  '∀t_NextAct_→TapResolvesToByRoleWithContext',
  { of: [Schema.String, Schema.String, Schema.Array(Schema.String)], subject: nextAct, arbitrary: { seed: 505_102 } },
  (subject, [role, name, ancestors]) => {
    const leaf = nodeOf('n-1', role, name, false, [])
    const tree = [
      chainOf(ancestors, leaf),
      nodeOf('n-2', `${role}-other`, name, false, []),
      nodeOf('n-3', role, `${name}-other`, false, []),
    ]
    const answer = toolAnswer(callOf('call-1', 'tap', { ref: 'n-1' }))
    const decision = decisionOf(subject, commandOf(answer, observationOf(tree), {}))
    const action: Action = { _tag: 'Tap', target: byRole(role, name) }
    const controls = [{ role, name, context: ancestors }]
    return isExecute(decision, 'call-1', action, [locatedRef('n-1')], controls)
  },
)

it.prop(
  '∀t_NextAct_→SharedRoleNameResolvesToNthByDocumentOrder',
  { of: [Schema.String, Schema.String], subject: nextAct, arbitrary: { seed: 505_103 } },
  (subject, [role, name]) => {
    const tree = [
      nodeOf('n-1', role, name, false, []),
      nodeOf('n-2', role, name, false, []),
      nodeOf('n-3', role, name, true, []),
      nodeOf('n-4', role, `${name}-other`, false, []),
    ]
    const nth = (index: number): Locator => ({
      expression: { kind: 'Nth', inner: byRole(role, name).expression, index },
      label: `${role} "${name}"`,
    })
    const controls = [{ role, name, context: [] }]
    const first = decisionOf(
      subject,
      commandOf(toolAnswer(callOf('c-1', 'tap', { ref: 'n-1' })), observationOf(tree), {}),
    )
    const second = decisionOf(
      subject,
      commandOf(toolAnswer(callOf('c-2', 'tap', { ref: 'n-2' })), observationOf(tree), {}),
    )
    return isExecute(first, 'c-1', { _tag: 'Tap', target: nth(0) }, [locatedRef('n-1')], controls) &&
      isExecute(second, 'c-2', { _tag: 'Tap', target: nth(1) }, [locatedRef('n-2')], controls)
  },
)

it.prop(
  '∀t_NextAct_→StepsBoundaryExhaustsOrExecutes',
  { of: [Schema.String, Schema.String, Schema.Int], subject: nextAct, arbitrary: { seed: 505_104 } },
  (subject, [role, name, drawn]) => {
    const maxSteps = Math.abs(drawn) % 5 + 1
    const tree = [nodeOf('n-1', role, name, false, [])]
    const answer = toolAnswer(callOf('call-1', 'tap', { ref: 'n-1' }))
    const spent = decisionOf(
      subject,
      commandOf(answer, observationOf(tree), { steps: maxSteps, maxSteps, modelCalls: 1, maxModelCalls: 5 }),
    )
    const lastFree = decisionOf(
      subject,
      commandOf(answer, observationOf(tree), { steps: maxSteps - 1, maxSteps, modelCalls: 1, maxModelCalls: 5 }),
    )
    return isExhausted(spent, 'steps') &&
      isExecute(lastFree, 'call-1', { _tag: 'Tap', target: byRole(role, name) }, [locatedRef('n-1')], [
        { role, name, context: [] },
      ])
  },
)

it.prop(
  '∀t_NextAct_→InvalidAnswersCorrectOrExhaustModelCalls',
  { of: [Schema.Int, Schema.String, Schema.String], subject: nextAct, arbitrary: { seed: 505_105 } },
  (subject, [drawn, role, name]) => {
    const tree = [
      nodeOf('n-1', role, name, false, []),
      nodeOf('n-hidden', role, name, true, []),
      nodeOf('n-orole', undefined, name, false, []),
    ]
    const which = Math.abs(drawn) % 7
    const answer: ModelAnswer = which === 0
      ? { _tag: 'Text', text: `${role}:${name}` }
      : which === 1
      ? toolAnswer(callOf('call-1', 'frobnicate', {}))
      : which === 2
      ? toolAnswer(callOf('call-1', 'tap', { ref: 'missing' }))
      : which === 3
      ? toolAnswer(callOf('call-1', 'tap', { ref: 'n-hidden' }))
      : which === 4
      ? toolAnswer(callOf('call-1', 'tap', { ref: 42 }))
      : which === 5
      ? toolAnswer(callOf('call-1', 'fill', { ref: 'n-1', value: { secret: 'not-a-param' } }))
      : toolAnswer(callOf('call-1', 'tap', { ref: 'n-orole' }))
    const corrected = decisionOf(subject, commandOf(answer, observationOf(tree), {}))
    const spent = decisionOf(
      subject,
      commandOf(answer, observationOf(tree), { modelCalls: 5, maxModelCalls: 5 }),
    )
    const correct = which === 0 ? isUserCorrect(corrected) : isToolCorrectFor(corrected, 'call-1')
    return correct && isExhausted(spent, 'model-calls')
  },
)

it.prop(
  '∀t_NextAct_→FillWithNamedSecretExecutesWithSecretRef',
  { of: [Schema.String], subject: nextAct, arbitrary: { seed: 505_106 } },
  (subject, [name]) => {
    const tree = [nodeOf('n-1', 'textbox', name, false, [])]
    const answer = toolAnswer(callOf('call-1', 'fill', { ref: 'n-1', value: { secret: 'pw' } }))
    const decision = decisionOf(subject, commandOf(answer, observationOf(tree), { secrets: ['pw'] }))
    const action: Action = { _tag: 'Fill', target: byRole('textbox', name), value: { secret: 'pw' } }
    return isExecute(decision, 'call-1', action, [locatedRef('n-1')], [{ role: 'textbox', name, context: [] }])
  },
)

it.prop(
  '∀t_NextAct_→MissingCapabilityUnsupportedElseDecides',
  { of: [Schema.Finite, Schema.Finite, Schema.String, Schema.String], subject: nextAct, arbitrary: { seed: 505_107 } },
  (subject, [x, y, role, name]) => {
    const tree = [nodeOf('n-1', role, name, false, []), nodeOf('n-2', role, `${name}-to`, false, [])]
    const atCall = callOf('call-1', 'tap_at', { x, y })
    const noWeb = decisionOf(subject, commandOf(toolAnswer(atCall), observationOf(tree), { capabilities: [] }))
    const withWeb = decisionOf(
      subject,
      commandOf(toolAnswer(atCall), observationOf(tree), { capabilities: ['web'] }),
    )
    const dragCall = callOf('call-2', 'drag', { from: 'n-1', to: 'n-2' })
    const noDrag = decisionOf(subject, commandOf(toolAnswer(dragCall), observationOf(tree), { capabilities: [] }))
    const withDrag = decisionOf(
      subject,
      commandOf(toolAnswer(dragCall), observationOf(tree), { capabilities: ['drag'] }),
    )
    const shotCall = callOf('call-3', 'screenshot', {})
    const noShot = decisionOf(subject, commandOf(toolAnswer(shotCall), observationOf(tree), { capabilities: [] }))
    const withShot = decisionOf(
      subject,
      commandOf(toolAnswer(shotCall), observationOf(tree), { capabilities: ['screenshot'] }),
    )
    const shotSpent = decisionOf(
      subject,
      commandOf(toolAnswer(shotCall), observationOf(tree), {
        capabilities: ['screenshot'],
        modelCalls: 5,
        maxModelCalls: 5,
      }),
    )
    return isUnsupportedOf(noWeb, 'call-1', 'web') &&
      isExecute(withWeb, 'call-1', { _tag: 'TapAt', point: { x, y } }, [], []) &&
      isUnsupportedOf(noDrag, 'call-2', 'drag') &&
      isExecute(
        withDrag,
        'call-2',
        {
          _tag: 'Drag',
          from: byRole(role, name),
          to: byRole(role, `${name}-to`),
        },
        [locatedRef('n-1'), locatedRef('n-2')],
        [
          { role, name, context: [] },
          { role, name: `${name}-to`, context: [] },
        ],
      ) &&
      isUnsupportedOf(noShot, 'call-3', 'screenshot') &&
      isCaptureOf(withShot, 'call-3') &&
      isExhausted(shotSpent, 'model-calls')
  },
)

it.prop(
  '∀t_NextAct_→OnlyFirstCallIsDecided',
  { of: [Schema.String, Schema.String], subject: nextAct, arbitrary: { seed: 505_108 } },
  (subject, [role, name]) => {
    const tree = [nodeOf('n-1', role, name, false, [])]
    const first = callOf('call-1', 'tap', { ref: 'n-1' })
    const executed = decisionOf(
      subject,
      commandOf(toolAnswer(first, callOf('call-2', 'done', { summary: name })), observationOf(tree), {}),
    )
    const corrected = decisionOf(
      subject,
      commandOf(
        toolAnswer(callOf('call-1', 'tap', { ref: 'missing' }), callOf('call-2', 'tap', { ref: 'n-1' })),
        observationOf(tree),
        {},
      ),
    )
    return isExecute(executed, 'call-1', { _tag: 'Tap', target: byRole(role, name) }, [locatedRef('n-1')], [
      { role, name, context: [] },
    ]) && isToolCorrectFor(corrected, 'call-1')
  },
)

it.prop(
  '∀t_NextAct_→SpentModelCallsExhaustAValidAction',
  { of: [Schema.String, Schema.String, Schema.Int], subject: nextAct, arbitrary: { seed: 505_109 } },
  (subject, [role, name, drawn]) => {
    const maxModelCalls = Math.abs(drawn) % 5 + 1
    const tree = [nodeOf('n-1', role, name, false, [])]
    const answer = toolAnswer(callOf('call-1', 'tap', { ref: 'n-1' }))
    const decision = decisionOf(
      subject,
      commandOf(answer, observationOf(tree), { modelCalls: maxModelCalls, maxModelCalls }),
    )
    return isExhausted(decision, 'model-calls')
  },
)

it.prop(
  '∀c_ActTools_≡OneDefinitionPerDeclaredCapability',
  { of: [Schema.Array(EngineCapability)], subject: actTools, arbitrary: { seed: 505_110 } },
  (subject, [capabilities]) => {
    const names = subject(capabilities).map((tool) => tool.name)
    const declares = (capability: EngineCapability): boolean => capabilities.includes(capability)
    return names.includes('tap_at') === declares('web') &&
      names.includes('type_at') === declares('web') &&
      names.includes('screenshot') === declares('screenshot') &&
      names.includes('drag') === declares('drag') &&
      names.includes('tap') &&
      names.includes('fill') &&
      names.includes('done') &&
      subject(capabilities).every((tool) => tool.parameters['type'] === 'object')
  },
)

it.prop(
  '∀p_TaskMessage_→RendersSecretByNameAndGoalVerbatim',
  {
    of: [Schema.String, Schema.String, SecretRef, Unique, Schema.String, Schema.String],
    subject: taskMessageOf,
    arbitrary: { seed: 505_111 },
  },
  (subject, [context, instruction, secretRef, unique, userName, otherValue]) => {
    const message: Message = subject({
      context,
      instruction,
      params: { zeta: otherValue, password: secretRef, user: userName, nonce: unique },
      replayed: [],
    })
    const header = context.length === 0 ? `Goal: ${instruction}` : `${context}\nGoal: ${instruction}`
    const expectedText = `${header}\nParams:\n- nonce: ${
      JSON.stringify(unique.value)
    }\n- password: secret "${secretRef.secret}", value withheld; fill it with {"secret":"${secretRef.secret}"}\n- user: ${
      JSON.stringify(userName)
    }\n- zeta: ${JSON.stringify(otherValue)}`
    const expected: Message = { _tag: 'UserMessage', content: [{ _tag: 'TextPart', text: expectedText }] }
    return JSON.stringify(message) === JSON.stringify(expected)
  },
)

it.prop(
  '∀a_DescribeAction_→SecretFillNamesOnlyTheSecret',
  {
    of: [Schema.String, Schema.String, SecretRef, Schema.String],
    subject: describeAction,
    arbitrary: { seed: 505_112 },
  },
  (subject, [role, name, secretRef, text]) => {
    const secretFill: Action = { _tag: 'Fill', target: byRole(role, name), value: secretRef }
    const textFill: Action = { _tag: 'Fill', target: byRole(role, name), value: text }
    return subject(secretFill) === `fill ${role} "${name}" with secret "${secretRef.secret}"` &&
      subject(textFill) === `fill ${role} "${name}" with ${JSON.stringify(text)}`
  },
)
