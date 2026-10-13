import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { isStateMachineFamilySpecifier } from '@systemfsoftware/oxlint-import-origin'

import { variableOf } from './kernel-boundary.js'
import {
  literalStringOf,
  memberPathOf,
  type ModuleOrigin,
  moduleOriginsWithCallResultsOf,
  originWithCallResultsOf,
  staticNameOf,
} from './module-origin.js'
import { moduleDeclarationsOf, walk } from './module-scope.js'
import {
  DISALLOWED_KEY_EXPECTED,
  DISALLOWED_KEY_FIX,
  disallowedKeyActual,
  disallowedKeyName,
  DYNAMIC_EXPECTED,
  DYNAMIC_FIX,
  DYNAMIC_NAME,
  dynamicImportActual,
  meta,
  MISSING_EVENT_EXPECTED,
  missingEventActual,
  missingEventFix,
  missingEventName,
  PERMITTED_CONFIG_KEYS,
  REEXPORT_EXPECTED,
  REEXPORT_FIX,
  REEXPORT_NAME,
  reExportActual,
  ROOT_EXPECTED,
  ROOT_FIX,
  ROOT_NAME,
  rootActual,
  UNCLOSED_EXPECTED,
  UNCLOSED_FIX,
  UNCLOSED_NAME,
  unclosedActual,
  UNRESOLVABLE_EXPECTED,
  UNRESOLVABLE_FIX,
  UNRESOLVABLE_NAME,
  unresolvableActual,
} from './shell-machine-follows-events.config.js'

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

/**
 * The members that forward a call instead of naming a factory member:
 * `createFSM.call(null, config)`, `createFSM.apply(null, [config])` and
 * `createFSM.bind(null)` all reach the same factory path.
 */
const FORWARDING_MEMBERS: Readonly<Record<string, true>> = {
  apply: true,
  bind: true,
  call: true,
}

/** The forwarding member a member expression ends on, or `null`. */
const forwardingMemberOf = (node: ESTree.Node): string | null => {
  if (node.type !== 'MemberExpression') return null
  const name = staticNameOf(node.property)
  return name !== null && FORWARDING_MEMBERS[name] === true ? name : null
}

/** The origin a factory path denotes, with one trailing forwarding member removed. */
const forwardedOriginOf = (origin: ModuleOrigin | null): ModuleOrigin | null => {
  if (origin === null) return null
  const last = origin.members[origin.members.length - 1]
  if (last === undefined || FORWARDING_MEMBERS[last] !== true) return origin
  return { source: origin.source, members: origin.members.slice(0, -1) }
}

/** The first element of an `apply` argument list, when that list is readable here. */
const appliedItemOf = (list: ESTree.Node | undefined): ESTree.Node | null => {
  if (list === undefined || list.type !== 'ArrayExpression') return null
  return list.elements[0] ?? null
}

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
 * (direct, or `setup`'s, chained, destructured or held in a `const`), or any
 * path whose last member is `createMachine` — the root factory, which carries
 * guards, eventless and delayed transitions, invocations and actions. The last
 * member decides, so `setupEffect(...).createMachine` from the Effect fork is
 * the same root factory as the upstream `setup(...).createMachine`.
 */
const factoryKindOf = (origin: ModuleOrigin): 'fsm' | 'root' | null => {
  const path = memberPathOf(origin)
  if (path === CREATE_FSM || path === `${SETUP}.${CREATE_FSM}`) return 'fsm'
  if (origin.members[origin.members.length - 1] === CREATE_MACHINE) return 'root'
  return null
}

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

        const report = (
          node: ESTree.Node,
          messageId: MessageIds,
          data: Readonly<Record<string, string>>,
        ): void => {
          context.report({ node, messageId, data })
        }

        /**
         * A config node the rule can read: an object literal, or a module `const`
         * holding one. The identifier must resolve to that module binding, so a
         * nearer binding of the same name is unreadable rather than judged as the
         * module table it shadows.
         */
        const resolveObject = (node: ESTree.Node, depth: number): ESTree.ObjectExpression | null => {
          if (depth > RESOLUTION_DEPTH) return null
          if (node.type === 'ObjectExpression') return node
          if (node.type !== 'Identifier') return null
          const init = constInitializers.get(node.name)
          if (init === undefined || init === node) return null
          const definition = variableOf(node, context.sourceCode.getScope)?.defs[0]
          if (definition === undefined || definition.node.type !== 'VariableDeclarator') return null
          if (definition.node.init !== init) return null
          return resolveObject(init, depth + 1)
        }

        const reportUnresolvable = (node: ESTree.Node, observed: string): void => {
          report(node, 'unresolvableConfig', {
            name: UNRESOLVABLE_NAME,
            expected: UNRESOLVABLE_EXPECTED,
            actual: unresolvableActual(observed),
            fix: UNRESOLVABLE_FIX,
          })
        }

        const reportUnclosed = (node: ESTree.Node, observed: string): void => {
          report(node, 'unclosedTransition', {
            name: UNCLOSED_NAME,
            expected: UNCLOSED_EXPECTED,
            actual: unclosedActual(observed),
            fix: UNCLOSED_FIX,
          })
        }

        const reportDisallowedKey = (node: ESTree.Node, key: string): void => {
          report(node, 'disallowedConfigKey', {
            name: disallowedKeyName(key),
            expected: DISALLOWED_KEY_EXPECTED,
            actual: disallowedKeyActual(key),
            fix: DISALLOWED_KEY_FIX,
          })
        }

        const reportMissingEvent = (node: ESTree.Node, stateName: string, event: string): void => {
          report(node, 'missingEventType', {
            name: missingEventName(stateName, event),
            expected: MISSING_EVENT_EXPECTED,
            actual: missingEventActual(stateName, event),
            fix: missingEventFix(stateName, event),
          })
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
              if (literalStringOf(entry.value) === null) return false
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
          if (literalStringOf(value) !== null) return
          if (value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression') {
            if (!isEventCopy(value)) {
              reportUnclosed(
                value,
                'a transition function whose body is not one fixed target with an event-copy context patch',
              )
            }
            return
          }
          if (value.type === 'ObjectExpression') {
            // The object form is a fixed target only when its `target` is a string
            // literal: any other expression there decides inside the machine.
            for (const property of value.properties) {
              if (property.type !== 'Property' || property.computed) continue
              if (staticNameOf(property.key) !== 'target') continue
              if (literalStringOf(property.value) === null) {
                reportUnclosed(property.value, 'an object transition whose target is not a string literal')
              }
            }
            judgeTable(value, null)
            return
          }
          if (value.type === 'Identifier') {
            reportUnresolvable(value, 'a transition value held in an identifier')
            return
          }
          reportUnclosed(value, 'a transition value that is neither a string target, a function, nor an `on` table')
        }

        /** The event types an `on` table names, with every transition judged. */
        const judgeOn = (value: ESTree.Node): ReadonlySet<string> => {
          const object = resolveObject(value, 0)
          if (object === null) {
            reportUnresolvable(value, 'an `on` table that is not an object literal')
            return new Set()
          }
          const flat = flatten(object, 0)
          for (const spread of flat.unresolvedSpreads) {
            reportUnresolvable(spread, 'an `on` table spread from a binding this rule cannot read')
          }
          const eventNames = new Set<string>()
          for (const entry of flat.entries) {
            if (entry.key === null) {
              reportUnresolvable(entry.node, 'a computed event key')
              continue
            }
            eventNames.add(entry.key)
            judgeTransition(entry.value)
          }
          return eventNames
        }

        const judgeStates = (value: ESTree.Node): void => {
          const object = resolveObject(value, 0)
          if (object === null) {
            reportUnresolvable(value, 'a `states` table that is not an object literal')
            return
          }
          const flat = flatten(object, 0)
          for (const spread of flat.unresolvedSpreads) {
            reportUnresolvable(spread, 'a `states` table spread from a binding this rule cannot read')
          }
          for (const entry of flat.entries) {
            // A state named by a computed key cannot be compared with its siblings,
            // so the table is refused rather than judged under a placeholder name.
            if (entry.key === null) {
              reportDisallowedKey(entry.node, COMPUTED_KEY)
              continue
            }
            const state = resolveObject(entry.value, 0)
            if (state === null) {
              reportUnresolvable(entry.value, 'a state value this rule cannot resolve to an object literal')
              continue
            }
            // A state with no `on` entry handles no event, so it still enters the
            // completeness comparison — with an empty event set — the same way a
            // state with an empty `on` table does.
            if (!judgeTable(state, entry.key)) {
              states.push({ stateName: entry.key, node: entry.value, eventNames: new Set() })
            }
          }
        }

        /**
         * One table at any level: only the permitted keys, and each `on` judged
         * as a table. Reports whether the table carried an `on` entry.
         */
        function judgeTable(object: ESTree.ObjectExpression, stateName: string | null): boolean {
          const flat = flatten(object, 0)
          for (const spread of flat.unresolvedSpreads) {
            reportUnresolvable(spread, 'a spread from a binding this rule cannot read')
          }
          let judgedOn = false
          for (const entry of flat.entries) {
            if (entry.key === null || PERMITTED_CONFIG_KEYS[entry.key] !== true) {
              reportDisallowedKey(entry.node, entry.key ?? COMPUTED_KEY)
              continue
            }
            if (entry.key === 'states') {
              judgeStates(entry.value)
              continue
            }
            if (entry.key === 'on') {
              judgedOn = true
              const eventNames = judgeOn(entry.value)
              if (stateName !== null) states.push({ stateName, node: entry.value, eventNames })
            }
          }
          return judgedOn
        }

        /** Every state names every event type some state of the machine handles. */
        const checkCompleteness = (judged: readonly StateOn[]): void => {
          const handled = new Set<string>()
          for (const state of judged) for (const event of state.eventNames) handled.add(event)
          for (const state of judged) {
            for (const event of handled) {
              if (!state.eventNames.has(event)) {
                reportMissingEvent(state.node, state.stateName, event)
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
          const forwarded = forwardingMemberOf(node.callee)
          // `createFSM.bind(null)` builds a bound factory and passes no config:
          // the later call on the bound value is judged, with `.bind` stripped
          // off the origin the alias carries.
          if (forwarded === 'bind') return
          const origin = forwardedOriginOf(originWithCallResultsOf(node.callee, origins))
          if (origin === null || !isStateMachineFamilySpecifier(origin.source)) return
          const kind = factoryKindOf(origin)
          if (kind === 'root') {
            report(node, 'rootMachineFactory', {
              name: ROOT_NAME,
              expected: ROOT_EXPECTED,
              actual: rootActual(memberPathOf(origin)),
              fix: ROOT_FIX,
            })
            return
          }
          if (kind !== 'fsm') return
          const argument = forwarded === 'apply'
            ? appliedItemOf(node.arguments[1])
            : forwarded === 'call'
            ? node.arguments[1] ?? null
            : node.arguments[0] ?? null
          if (argument === null) {
            reportUnresolvable(node, 'a factory call with no readable config argument')
            return
          }
          if (argument.type === 'SpreadElement') {
            reportUnresolvable(argument, 'a config spread into the factory call')
            return
          }
          const config = resolveObject(argument, 0)
          if (config === null) {
            reportUnresolvable(argument, 'a config argument that is not an object literal')
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
              const source = literalStringOf(node.source)
              if (source !== null && isStateMachineFamilySpecifier(source)) {
                report(node, 'familyDynamicImport', {
                  name: DYNAMIC_NAME,
                  expected: DYNAMIC_EXPECTED,
                  actual: dynamicImportActual(source),
                  fix: DYNAMIC_FIX(source),
                })
              }
              return
            }
            case 'ExportNamedDeclaration':
            case 'ExportAllDeclaration': {
              if (node.exportKind === 'type') return
              // Every specifier type-only is a type edge: it carries no machine.
              if (
                node.type === 'ExportNamedDeclaration' && node.specifiers.length > 0 &&
                node.specifiers.every((specifier) => specifier.exportKind === 'type')
              ) {
                return
              }
              const source = node.source
              // `export { x }` with no `from` re-exports whatever `x` is bound to, so
              // an imported family binding exported by name is a family re-export.
              const familySource = source === null
                ? node.type === 'ExportNamedDeclaration'
                  ? node.specifiers
                    .filter((specifier) => specifier.exportKind !== 'type')
                    .map((specifier) => origins.get(staticNameOf(specifier.local) ?? '')?.source)
                    .find((origin) => origin !== undefined && isStateMachineFamilySpecifier(origin))
                  : undefined
                : isStateMachineFamilySpecifier(source.value)
                ? source.value
                : undefined
              if (familySource === undefined) return
              report(node, 'familyReExport', {
                name: REEXPORT_NAME,
                expected: REEXPORT_EXPECTED,
                actual: reExportActual(familySource),
                fix: REEXPORT_FIX(familySource),
              })
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
