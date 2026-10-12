import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isStateMachineFamilySpecifier } from '@systemfsoftware/oxlint-import-origin'

import {
  memberPathOf,
  type ModuleOrigin,
  moduleOriginsWithCallResultsOf,
  originWithCallResultsOf,
  staticNameOf,
} from './module-origin.js'
import { moduleDeclarationsOf, walk } from './module-scope.js'
import { meta, PERMITTED_CONFIG_KEYS } from './shell-machine-follows-events.config.js'

export type Options = []
export type MessageIds =
  | 'unresolvableConfig'
  | 'unclosedTransition'
  | 'disallowedConfigKey'
  | 'missingEventType'
  | 'rootMachineFactory'
  | 'familyDynamicImport'
  | 'familyReExport'

const CREATE_FSM = 'createFSM'
const SETUP = 'setup'
const CREATE_MACHINE = 'createMachine'
const COMPUTED_KEY = 'a computed key'
const RESOLUTION_DEPTH = 8
const EVENT_READ_ROOT = 'event'

interface StateOn {
  readonly stateName: string
  readonly node: ESTree.Node
  readonly eventNames: ReadonlySet<string>
}

interface TableEntry {
  readonly node: ESTree.Node
  readonly key: string | null
  readonly value: ESTree.Expression
}

interface FlatTable {
  readonly entries: readonly TableEntry[]
  readonly unresolvedSpreads: readonly ESTree.SpreadElement[]
}

/**
 * The family factory a callee origin denotes: the `/fsm` entry's `createFSM`
 * (direct, or `setup`'s, chained, destructured or held in a `const`), or the
 * root `createMachine`, which carries guards, eventless and delayed
 * transitions, invocations and actions.
 */
const factoryKindOf = (origin: ModuleOrigin): 'fsm' | 'root' | null => {
  const path = memberPathOf(origin)
  if (path === CREATE_FSM || path === `${SETUP}.${CREATE_FSM}`) return 'fsm'
  if (path === CREATE_MACHINE || path === `${SETUP}.${CREATE_MACHINE}`) return 'root'
  return null
}

const stringValueOf = (node: ESTree.Node): string | null =>
  node.type === 'Literal' && typeof node.value === 'string' ? node.value : null

/** Whether the node reads a field of the transition event (`event.id`, `event.at.value`). */
const readsEventField = (node: ESTree.Node): boolean => {
  if (node.type !== 'MemberExpression') return false
  let root: ESTree.Node = node.object
  while (root.type === 'MemberExpression') root = root.object
  return root.type === 'Identifier' && root.name === EVENT_READ_ROOT
}

export const shellMachineFollowsEvents = defineRule({
  meta,
  create(context: Context) {
    return {
      Program(program: ESTree.Program) {
        const origins = moduleOriginsWithCallResultsOf(program)
        const constInitializers = new Map<string, ESTree.Node>()
        for (const declaration of moduleDeclarationsOf(program)) {
          if (declaration.kind !== 'const' || declaration.name === null) continue
          const init = declaration.declarator.init
          if (init !== null) constInitializers.set(declaration.name, init)
        }

        const states: StateOn[] = []

        const report = (node: ESTree.Node, messageId: MessageIds): void => {
          context.report({ node, messageId })
        }

        const reportData = (
          node: ESTree.Node,
          messageId: MessageIds,
          data: Readonly<Record<string, string>>,
        ): void => {
          context.report({ node, messageId, data })
        }

        /** A config node the rule can read: an object literal, or a module `const` holding one. */
        const resolveObject = (node: ESTree.Node, depth: number): ESTree.ObjectExpression | null => {
          if (depth > RESOLUTION_DEPTH) return null
          if (node.type === 'ObjectExpression') return node
          if (node.type !== 'Identifier') return null
          const init = constInitializers.get(node.name)
          if (init === undefined || init === node) return null
          return resolveObject(init, depth + 1)
        }

        /**
         * The properties of a table, with every spread of a resolvable module
         * `const` object literal merged in. A spread the rule cannot read is
         * kept aside: the config is then outside the closed form by design.
         */
        const flatten = (object: ESTree.ObjectExpression, depth: number): FlatTable => {
          const entries: TableEntry[] = []
          const unresolvedSpreads: ESTree.SpreadElement[] = []
          if (depth > RESOLUTION_DEPTH) return { entries, unresolvedSpreads }
          for (const property of object.properties) {
            if (property.type === 'SpreadElement') {
              const spread = resolveObject(property.argument, depth + 1)
              if (spread === null) {
                unresolvedSpreads.push(property)
                continue
              }
              const inner = flatten(spread, depth + 1)
              entries.push(...inner.entries)
              unresolvedSpreads.push(...inner.unresolvedSpreads)
              continue
            }
            entries.push({
              node: property,
              key: property.computed ? null : staticNameOf(property.key),
              value: property.value,
            })
          }
          return { entries, unresolvedSpreads }
        }

        /**
         * A transition function may only copy event fields: its body is one
         * object literal of a fixed `target` and a `context` patch whose values
         * are `event.<field>` reads.
         */
        const isEventCopy = (fn: ESTree.ArrowFunctionExpression | ESTree.Function): boolean => {
          const body = fn.body
          if (body === null || body.type !== 'ObjectExpression') return false
          const flat = flatten(body, 0)
          if (flat.unresolvedSpreads.length > 0) return false
          let targets = false
          for (const entry of flat.entries) {
            if (entry.key === 'target') {
              if (stringValueOf(entry.value) === null) return false
              targets = true
              continue
            }
            if (entry.key === 'context') {
              if (entry.value.type !== 'ObjectExpression') return false
              for (const property of entry.value.properties) {
                if (property.type !== 'Property' || !readsEventField(property.value)) return false
              }
              continue
            }
            return false
          }
          return targets
        }

        const judgeTransition = (value: ESTree.Node): void => {
          if (stringValueOf(value) !== null) return
          if (value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression') {
            if (!isEventCopy(value)) report(value, 'unclosedTransition')
            return
          }
          if (value.type === 'ObjectExpression') {
            judgeTable(value, null)
            return
          }
          if (value.type === 'Identifier') {
            report(value, 'unresolvableConfig')
            return
          }
          report(value, 'unclosedTransition')
        }

        /** The event types an `on` table names, with every transition judged. */
        const judgeOn = (value: ESTree.Node): ReadonlySet<string> => {
          const object = resolveObject(value, 0)
          if (object === null) {
            report(value, 'unresolvableConfig')
            return new Set()
          }
          const flat = flatten(object, 0)
          for (const spread of flat.unresolvedSpreads) report(spread, 'unresolvableConfig')
          const eventNames = new Set<string>()
          for (const entry of flat.entries) {
            if (entry.key !== null) eventNames.add(entry.key)
            judgeTransition(entry.value)
          }
          return eventNames
        }

        const judgeStates = (value: ESTree.Node): void => {
          const object = resolveObject(value, 0)
          if (object === null) {
            report(value, 'unresolvableConfig')
            return
          }
          const flat = flatten(object, 0)
          for (const spread of flat.unresolvedSpreads) report(spread, 'unresolvableConfig')
          for (const entry of flat.entries) {
            const state = resolveObject(entry.value, 0)
            if (state === null) {
              report(entry.value, 'unresolvableConfig')
              continue
            }
            judgeTable(state, entry.key ?? COMPUTED_KEY)
          }
        }

        /** One table at any level: only the permitted keys, and each `on` judged as a table. */
        function judgeTable(object: ESTree.ObjectExpression, stateName: string | null): void {
          const flat = flatten(object, 0)
          for (const spread of flat.unresolvedSpreads) report(spread, 'unresolvableConfig')
          for (const entry of flat.entries) {
            if (entry.key === null || PERMITTED_CONFIG_KEYS[entry.key] !== true) {
              reportData(entry.node, 'disallowedConfigKey', { key: entry.key ?? COMPUTED_KEY })
              continue
            }
            if (entry.key === 'states') {
              judgeStates(entry.value)
              continue
            }
            if (entry.key === 'on') {
              const eventNames = judgeOn(entry.value)
              if (stateName !== null) states.push({ stateName, node: entry.value, eventNames })
            }
          }
        }

        /** Every state names every event type some state of the machine handles. */
        const checkCompleteness = (judged: readonly StateOn[]): void => {
          const handled = new Set<string>()
          for (const state of judged) for (const event of state.eventNames) handled.add(event)
          for (const state of judged) {
            for (const event of handled) {
              if (!state.eventNames.has(event)) {
                reportData(state.node, 'missingEventType', { state: state.stateName, event })
              }
            }
          }
        }

        const judgeConfig = (object: ESTree.ObjectExpression): void => {
          const from = states.length
          judgeTable(object, null)
          checkCompleteness(states.slice(from))
        }

        const judgeFactoryCall = (node: ESTree.CallExpression): void => {
          const origin = originWithCallResultsOf(node.callee, origins)
          if (origin === null || !isStateMachineFamilySpecifier(origin.source)) return
          const kind = factoryKindOf(origin)
          if (kind === 'root') {
            report(node, 'rootMachineFactory')
            return
          }
          if (kind !== 'fsm') return
          const argument = node.arguments[0]
          if (argument === undefined || argument.type === 'SpreadElement') {
            report(argument ?? node, 'unresolvableConfig')
            return
          }
          const config = resolveObject(argument, 0)
          if (config === null) {
            report(argument, 'unresolvableConfig')
            return
          }
          judgeConfig(config)
        }

        walk(program, (node) => {
          switch (node.type) {
            case 'CallExpression':
              judgeFactoryCall(node)
              return
            case 'ImportExpression': {
              const source = stringValueOf(node.source)
              if (source !== null && isStateMachineFamilySpecifier(source)) {
                reportData(node, 'familyDynamicImport', { source })
              }
              return
            }
            case 'ExportNamedDeclaration':
            case 'ExportAllDeclaration': {
              const source = node.source
              if (source !== null && isStateMachineFamilySpecifier(source.value)) {
                reportData(node, 'familyReExport', { source: source.value })
              }
              return
            }
            default:
              return
          }
        })
      },
    }
  },
})
