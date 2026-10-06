import { Array as Arr, Option, Order } from 'effect'
import type { AnyStateMachine, AnyStateNode, AnyTransitionDefinition } from 'xstate'
import { mermaidIdOf, mermaidLabelOf } from './diagram-id.js'
import { asNonEmptyString, asRawObject, type Raw } from './shape.js'

const asFunctionName = (value: Raw): string | undefined =>
  typeof value === 'function' ? asNonEmptyString(value.name) : undefined

const asTagName = (value: Raw): string | undefined => {
  const object = asRawObject(value)
  return object === undefined ? undefined : asNonEmptyString(object['type'])
}

const guardCandidate = (guard: Raw): string | undefined => asNonEmptyString(guard) ?? asFunctionName(guard)

const guardNameOf = (guard: Raw): Option.Option<string> =>
  Option.fromNullishOr(guardCandidate(guard) ?? asTagName(guard))

const guardSuffixOf = (guard: Raw): string =>
  Option.match(guardNameOf(guard), { onNone: () => '', onSome: (name) => ` [${name}]` })

const alwaysSuffixOf = (guard: Raw): string =>
  Option.match(guardNameOf(guard), { onNone: () => '', onSome: (name) => `: [${name}]` })

const idOf = (node: AnyStateNode): string => mermaidIdOf(node.path.join('_'))

const targetIdsOf = (definition: AnyTransitionDefinition): ReadonlyArray<string> => {
  const targets: ReadonlyArray<AnyStateNode> = Option.getOrElse(Option.fromNullishOr(definition.target), () => [])
  return Arr.map(targets, (target) => mermaidIdOf(target.path.join('_')))
}

const transitionLinesOf = (source: AnyStateNode): ReadonlyArray<string> =>
  Arr.sort(Order.String)(
    Arr.flatMap(
      [...source.transitions.entries()],
      ([event, definitions]) =>
        Arr.flatMap(
          definitions,
          (definition) =>
            Arr.map(
              targetIdsOf(definition),
              (target) => `${idOf(source)} --> ${target}: ${event}${guardSuffixOf(definition.guard)}`,
            ),
        ),
    ),
  )

const alwaysLinesOf = (source: AnyStateNode): ReadonlyArray<string> => {
  const always: ReadonlyArray<AnyTransitionDefinition> = Option.getOrElse(
    Option.fromNullishOr(source.always),
    () => [],
  )
  return Arr.flatMap(
    always,
    (definition) =>
      Arr.map(
        targetIdsOf(definition),
        (target) => `${idOf(source)} --> ${target}${alwaysSuffixOf(definition.guard)}`,
      ),
  )
}

const initialLinesOf = (node: AnyStateNode): ReadonlyArray<string> => {
  const targets: ReadonlyArray<AnyStateNode> = Option.getOrElse(Option.fromNullishOr(node.initial.target), () => [])
  return Arr.map(targets, (target) => `[*] --> ${mermaidIdOf(target.path.join('_'))}`)
}

const finalLinesOf = (node: AnyStateNode): ReadonlyArray<string> =>
  node.type === 'final' ? [`${idOf(node)} --> [*]`] : []

const childEntriesOf = (node: AnyStateNode): ReadonlyArray<readonly [string, AnyStateNode]> =>
  Arr.sortWith(Object.entries(node.states), (entry) => entry[0], Order.String)

const stateBody = (node: AnyStateNode): ReadonlyArray<string> => [
  ...initialLinesOf(node),
  ...finalLinesOf(node),
  ...transitionLinesOf(node),
  ...alwaysLinesOf(node),
  ...Arr.flatMap(childEntriesOf(node), (entry) => stateRender(entry[1])),
]

function stateRender(node: AnyStateNode): ReadonlyArray<string> {
  const header = `state "${mermaidLabelOf(node.path.join('.'))}" as ${idOf(node)}`
  return childEntriesOf(node).length > 0
    ? [`${header} {`, ...stateBody(node), '}']
    : [header, ...initialLinesOf(node), ...finalLinesOf(node), ...transitionLinesOf(node), ...alwaysLinesOf(node)]
}

export const machineToMermaid = (machine: AnyStateMachine): ReadonlyArray<string> => [
  'stateDiagram-v2',
  ...stateBody(machine.root),
]
