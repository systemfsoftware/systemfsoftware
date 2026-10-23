import { it } from '@systemfsoftware/vitest'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'

import type { Observation } from '../../engine/observation.schema.js'
import { type SemanticNode } from '../../engine/semantic-node.schema.js'
import type { ModelAnswer, ToolCall } from '../../model/model.schema.js'
import type { Check } from '../../verdict/check.schema.js'
import { AdmitCheckAnswer, admitCheckAnswer, type AdmitCheckAnswerDecision } from '../admit-check-answer.workflow.js'
import { type LocatedNode, lookupNode, type NodeLookup } from '../located-node.schema.js'

const observationOf = (
  route: Observation['route'],
  revision: string,
  tree: ReadonlyArray<SemanticNode>,
): Observation => ({ route, revision, tree })

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

const decisionOf = (subject: typeof admitCheckAnswer, command: AdmitCheckAnswer): AdmitCheckAnswerDecision =>
  Result.match(subject(command), { onFailure: (missing: never) => missing, onSuccess: (decision) => decision })

const admittedOf = (decision: AdmitCheckAnswerDecision): { callId: string; check: Check } | undefined =>
  Match.valueTags(decision, { CheckAdmitted: (admitted) => admitted, CheckRefused: () => undefined })

const locatedOf = (lookup: NodeLookup): Option.Option<LocatedNode> =>
  Match.valueTags(lookup, {
    NodeAbsent: () => Option.none(),
    NodeRoleless: () => Option.none(),
    NodeLocated: ({ located }) => Option.some(located),
  })

const callOf = (id: string, name: string, args: Schema.JsonObject): ToolCall => ({ id, name, arguments: args })

const resolveCheckCall = (id: string, args: Schema.JsonObject): ToolCall => callOf(id, 'resolve_check', args)

const toolAnswer = (first: ToolCall, ...rest: ReadonlyArray<ToolCall>): ModelAnswer => ({
  _tag: 'ToolCalls',
  calls: [first, ...rest],
})

it.prop(
  '∀s_AdmitCheckAnswer_→RefLiteralAdmitsWithLocatedLocator',
  {
    of: [AdmitCheckAnswer, Schema.String, Schema.String, Schema.String],
    subject: admitCheckAnswer,
    arbitrary: { seed: 506_101 },
  },
  (subject, [command, role, name, other]) => {
    const tree = [
      nodeOf('n-1', role, name, false, []),
      nodeOf('n-4', role, name, false, []),
      nodeOf('n-2', role, other, false, []),
      nodeOf('n-h', role, name, true, []),
      nodeOf('n-3', undefined, name, false, []),
    ]
    const observation = observationOf(command.observation.route, command.observation.revision, tree)
    const args: Schema.JsonObject = {
      combine: 'all',
      literals: [
        { predicate: 'present', target: { ref: 'n-1' } },
        { predicate: 'text', target: { ref: 'n-1' }, match: 'contains', value: name },
      ],
    }
    const decision = decisionOf(
      subject,
      new AdmitCheckAnswer({ answer: toolAnswer(resolveCheckCall('call-1', args)), observation, refsOffered: true }),
    )
    const admitted = admittedOf(decision)
    const expected = Option.map(
      locatedOf(lookupNode(observation, 'n-1')),
      (located): Check => ({
        _tag: 'AllOf',
        checks: [
          { _tag: 'Present', locator: located.locator },
          { _tag: 'Text', locator: located.locator, match: { kind: 'contains', value: name } },
        ],
      }),
    )
    return Option.match(expected, {
      onNone: () => false,
      onSome: (expected) =>
        admitted !== undefined && admitted.callId === 'call-1' &&
        JSON.stringify(admitted.check) === JSON.stringify(expected),
    })
  },
)

it.prop(
  '∀s_AdmitCheckAnswer_→CombineAllAnyNegateAndSingleLeaf',
  {
    of: [AdmitCheckAnswer, Schema.String, Schema.String, Schema.Boolean, Schema.Boolean],
    subject: admitCheckAnswer,
    arbitrary: { seed: 506_102 },
  },
  (subject, [command, role, name, combineAll, negate]) => {
    const tree = [
      nodeOf('n-1', role, name, false, []),
      nodeOf('n-2', role, `${name}-b`, false, []),
    ]
    const observation = observationOf(command.observation.route, command.observation.revision, tree)
    const combine = combineAll ? 'all' : 'any'
    const literalA: Schema.JsonObject = { predicate: 'present', target: { ref: 'n-1' }, negate }
    const literalB: Schema.JsonObject = {
      predicate: 'value',
      target: { ref: 'n-2' },
      match: 'exact',
      value: name,
      negate,
    }
    const located1 = locatedOf(lookupNode(observation, 'n-1'))
    const located2 = locatedOf(lookupNode(observation, 'n-2'))
    const decide = (args: Schema.JsonObject) =>
      admittedOf(
        decisionOf(
          subject,
          new AdmitCheckAnswer({
            answer: toolAnswer(resolveCheckCall('call-1', args)),
            observation,
            refsOffered: true,
          }),
        ),
      )
    const expected = Option.all({ one: located1, two: located2 }).pipe(
      Option.map(({ one, two }): { many: Check; single: Check } => {
        const leafA: Check = negate
          ? { _tag: 'Not', check: { _tag: 'Present', locator: one.locator } }
          : { _tag: 'Present', locator: one.locator }
        const leafB: Check = negate
          ? { _tag: 'Not', check: { _tag: 'Value', locator: two.locator, match: { kind: 'exact', value: name } } }
          : { _tag: 'Value', locator: two.locator, match: { kind: 'exact', value: name } }
        const many: Check = combine === 'all' ? { _tag: 'AllOf', checks: [leafA, leafB] } : {
          _tag: 'AnyOf',
          checks: [leafA, leafB],
        }
        return { many, single: leafA }
      }),
    )
    const many = decide({ combine, literals: [literalA, literalB] })
    const single = decide({ combine, literals: [literalA] })
    return Option.match(expected, {
      onNone: () => false,
      onSome: (expected) =>
        many !== undefined && JSON.stringify(many.check) === JSON.stringify(expected.many) &&
        single !== undefined && JSON.stringify(single.check) === JSON.stringify(expected.single),
    })
  },
)

it.prop(
  '∀s_AdmitCheckAnswer_→RoleNameTargetAdmitsByRoleExactName',
  {
    of: [AdmitCheckAnswer, Schema.String, Schema.String],
    subject: admitCheckAnswer,
    arbitrary: { seed: 506_104 },
  },
  (subject, [command, role, name]) => {
    const tree = [nodeOf('n-1', role, name, false, [])]
    const observation = observationOf(command.observation.route, command.observation.revision, tree)
    const args: Schema.JsonObject = {
      combine: 'all',
      literals: [{ predicate: 'present', target: { role, name } }],
    }
    const expected: Check = {
      _tag: 'Present',
      locator: {
        expression: { kind: 'ByRole', role, name: { value: name, exact: true } },
        label: `${role} "${name}"`,
      },
    }
    const admitted = admittedOf(
      decisionOf(
        subject,
        new AdmitCheckAnswer({ answer: toolAnswer(resolveCheckCall('call-1', args)), observation, refsOffered: true }),
      ),
    )
    return admitted !== undefined && admitted.callId === 'call-1' &&
      JSON.stringify(admitted.check) === JSON.stringify(expected)
  },
)
