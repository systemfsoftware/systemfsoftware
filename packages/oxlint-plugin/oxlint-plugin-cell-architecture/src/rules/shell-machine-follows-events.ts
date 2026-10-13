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
  unwrapExpression,
} from './module-origin.js'
import { moduleDeclarationsOf, returnedValuesOf, walk } from './module-scope.js'
import {
  DISALLOWED_KEY_EXPECTED,
  DISALLOWED_KEY_FIX,
  disallowedKeyActual,
  disallowedKeyName,
  DYNAMIC_EXPECTED,
  DYNAMIC_FIX,
  DYNAMIC_NAME,
  dynamicImportActual,
  MACHINE_CONFIG_KEYS,
  meta,
  MISSING_EVENT_EXPECTED,
  missingEventActual,
  missingEventFix,
  missingEventName,
  REEXPORT_EXPECTED,
  REEXPORT_FIX,
  REEXPORT_NAME,
  reExportActual,
  ROOT_EXPECTED,
  ROOT_FIX,
  ROOT_NAME,
  rootActual,
  STATE_CONFIG_KEYS,
  TRANSITION_CONFIG_KEYS,
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
const EVENT_PROPERTY_NAME = 'event'

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

const forwardingTailOf = (origin: ModuleOrigin | null): readonly string[] => {
  if (origin === null) return []
  let start = origin.members.length
  while (start > 0) {
    const member = origin.members[start - 1]
    if (member === undefined || FORWARDING_MEMBERS[member] !== true) break
    start -= 1
  }
  return origin.members.slice(start)
}

const forwardedOriginOf = (origin: ModuleOrigin | null): ModuleOrigin | null => {
  if (origin === null) return null
  const tail = forwardingTailOf(origin)
  if (tail.length === 0) return origin
  return { source: origin.source, members: origin.members.slice(0, origin.members.length - tail.length) }
}

const invokedMemberOf = (tail: readonly string[]): string | null => {
  let end = tail.length
  while (end > 0 && tail[end - 1] === 'bind') end -= 1
  return tail[end - 1] ?? null
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

const memberNameOf = (node: ESTree.MemberExpression): string | null =>
  node.computed ? staticNameOf(node.property) : node.property.type === 'Identifier' ? node.property.name : null

const memberOriginOf = (origin: ModuleOrigin, member: string): ModuleOrigin =>
  origin.members.length === 0
    ? { source: origin.source, members: [member] }
    : { source: origin.source, members: [...origin.members, member] }

const eventBindingOf = (fn: ESTree.ArrowFunctionExpression | ESTree.Function): ESTree.Node | null => {
  const parameter = fn.params[0]
  if (parameter === undefined || parameter.type !== 'ObjectPattern') return null
  for (const property of parameter.properties) {
    if (property.type !== 'Property' || property.computed) continue
    if (staticNameOf(property.key) !== EVENT_PROPERTY_NAME) continue
    return property.value
  }
  return null
}

const readsEventField = (
  node: ESTree.Node,
  fn: ESTree.ArrowFunctionExpression | ESTree.Function,
  getScope: (node: ESTree.Node) => unknown,
): boolean => {
  if (node.type !== 'MemberExpression') return false
  let root: ESTree.Node = node.object
  while (root.type === 'MemberExpression') root = root.object
  if (root.type !== 'Identifier') return false
  const eventBinding = eventBindingOf(fn)
  if (eventBinding === null || eventBinding.type !== 'Identifier') return false
  const read = variableOf(root, getScope)
  return read !== null && read.defs.some((definition) => definition.name === eventBinding)
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
        const resolveObject = (wrapped: ESTree.Node, depth: number): ESTree.ObjectExpression | null => {
          if (depth > RESOLUTION_DEPTH) return null
          const node = unwrapExpression(wrapped)
          if (node.type === 'ObjectExpression') return node
          if (node.type !== 'Identifier') return null
          const init = constInitializers.get(node.name)
          if (init === undefined || init === node) return null
          const definition = variableOf(node, context.sourceCode.getScope)?.defs[0]
          if (definition === undefined || definition.node.type !== 'VariableDeclarator') return null
          if (definition.node.init !== init) return null
          return resolveObject(init, depth + 1)
        }

        const heldRecordOf = (wrapped: ESTree.Node, depth: number): ESTree.ObjectExpression | null => {
          if (depth > RESOLUTION_DEPTH) return null
          const node = unwrapExpression(wrapped)
          if (node.type === 'ObjectExpression') return node
          if (node.type !== 'Identifier') return null
          const definition = variableOf(node, context.sourceCode.getScope)?.defs[0]
          if (definition === undefined || definition.type !== 'Variable') return null
          const declarator = definition.node
          if (declarator.type !== 'VariableDeclarator' || declarator.init === null) return null
          return declarator.id.type === 'Identifier' ? heldRecordOf(declarator.init, depth + 1) : null
        }

        const localFunctionOf = (wrapped: ESTree.Node): ESTree.ArrowFunctionExpression | ESTree.Function | null => {
          const node = unwrapExpression(wrapped)
          if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return node
          if (node.type !== 'Identifier') return null
          const definition = variableOf(node, context.sourceCode.getScope)?.defs[0]
          if (definition === undefined) return null
          const declaration = definition.node
          if (definition.type === 'FunctionName' && declaration.type === 'FunctionDeclaration') return declaration
          if (definition.type !== 'Variable' || declaration.type !== 'VariableDeclarator') return null
          const init = declaration.init === null ? null : unwrapExpression(declaration.init)
          return init !== null && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
            ? init
            : null
        }

        const localOriginOf = (wrapped: ESTree.Node, depth: number): ModuleOrigin | null => {
          if (depth > RESOLUTION_DEPTH) return null
          const node = unwrapExpression(wrapped)
          const moduleOrigin = originWithCallResultsOf(node, origins)
          if (moduleOrigin !== null) return moduleOrigin
          if (node.type === 'MemberExpression') {
            const member = memberNameOf(node)
            if (member === null) return null
            const base = localOriginOf(node.object, depth + 1)
            if (base !== null) return memberOriginOf(base, member)
            const record = heldRecordOf(node.object, depth + 1)
            if (record === null) return null
            for (const property of record.properties) {
              if (property.type !== 'Property' || property.computed) continue
              if (staticNameOf(property.key) === member) return localOriginOf(property.value, depth + 1)
            }
            return null
          }
          if (node.type === 'CallExpression') {
            const fn = localFunctionOf(node.callee)
            if (fn === null) return null
            for (const value of returnedValuesOf(fn)) {
              const origin = localOriginOf(value, depth + 1)
              if (origin !== null) return origin
            }
            return null
          }
          if (node.type !== 'Identifier') return null
          const definition = variableOf(node, context.sourceCode.getScope)?.defs[0]
          if (definition === undefined || definition.type !== 'Variable') return null
          const declarator = definition.node
          if (declarator.type !== 'VariableDeclarator' || declarator.init === null) return null
          const base = localOriginOf(declarator.init, depth + 1)
          if (base === null) return null
          if (declarator.id.type === 'Identifier') return base
          if (declarator.id.type !== 'ObjectPattern') return null
          for (const property of declarator.id.properties) {
            if (property.type !== 'Property') continue
            if (property.value.type !== 'Identifier' || property.value.name !== node.name) continue
            const member = staticNameOf(property.key)
            return member === null ? null : memberOriginOf(base, member)
          }
          return null
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
          const body = fn.body === null ? null : unwrapExpression(fn.body)
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
                if (
                  property.type !== 'Property' ||
                  property.computed ||
                  !readsEventField(property.value, fn, context.sourceCode.getScope)
                ) return false
              }
              continue
            }
            return false
          }
          return targets
        }

        const judgeTransition = (wrapped: ESTree.Node): void => {
          const value = unwrapExpression(wrapped)
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
            const flat = flatten(value, 0)
            let hasTarget = false
            for (const entry of flat.entries) {
              if (entry.key !== 'target') continue
              hasTarget = true
              if (literalStringOf(entry.value) === null) {
                reportUnclosed(entry.value, 'an object transition whose target is not a string literal')
              }
            }
            if (!hasTarget && flat.unresolvedSpreads.length === 0) {
              reportUnclosed(value, 'an object transition with no target')
            }
            judgeTable(value, TRANSITION_CONFIG_KEYS, null)
            return
          }
          if (value.type === 'Identifier') {
            reportUnresolvable(value, 'a transition value held in an identifier')
            return
          }
          reportUnclosed(value, 'a transition value that is neither a string target, a function, nor an `on` table')
        }

        const judgeOn = (value: ESTree.Node): ReadonlySet<string> | null => {
          const object = resolveObject(value, 0)
          if (object === null) {
            reportUnresolvable(value, 'an `on` table that is not an object literal')
            return null
          }
          const flat = flatten(object, 0)
          for (const spread of flat.unresolvedSpreads) {
            reportUnresolvable(spread, 'an `on` table spread from a binding this rule cannot read')
          }
          let readable = flat.unresolvedSpreads.length === 0
          const eventNames = new Set<string>()
          for (const entry of flat.entries) {
            if (entry.key === null) {
              reportUnresolvable(entry.node, 'a computed event key')
              readable = false
              continue
            }
            eventNames.add(entry.key)
            judgeTransition(entry.value)
          }
          return readable ? eventNames : null
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
            if (!judgeTable(state, STATE_CONFIG_KEYS, entry.key)) {
              states.push({ stateName: entry.key, node: entry.value, eventNames: new Set() })
            }
          }
        }

        function judgeTable(
          object: ESTree.ObjectExpression,
          keys: Readonly<Record<string, true>>,
          stateName: string | null,
        ): boolean {
          const flat = flatten(object, 0)
          for (const spread of flat.unresolvedSpreads) {
            reportUnresolvable(spread, 'a spread from a binding this rule cannot read')
          }
          let judgedOn = false
          for (const entry of flat.entries) {
            if (entry.key === null || keys[entry.key] !== true) {
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
              if (stateName !== null && eventNames !== null) states.push({ stateName, node: entry.value, eventNames })
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
          judgeTable(object, MACHINE_CONFIG_KEYS, null)
          checkCompleteness(states.slice(from))
        }

        const judgeFactoryCall = (node: ESTree.CallExpression): void => {
          const directOrigin = originWithCallResultsOf(node.callee, origins)
          const calleeOrigin = directOrigin ?? localOriginOf(node.callee, 0)
          const origin = forwardedOriginOf(calleeOrigin)
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
          if (kind !== 'fsm') {
            if (directOrigin === null && memberPathOf(origin) === SETUP) {
              reportUnresolvable(node, 'a family factory this rule cannot follow')
            }
            return
          }
          const direct = forwardingMemberOf(node.callee)
          const tail = forwardingTailOf(calleeOrigin)
          if (direct === 'bind' && invokedMemberOf(tail) !== null) return
          const member = direct ?? invokedMemberOf(tail)
          const argument = member === 'apply'
            ? appliedItemOf(node.arguments[1])
            : member === 'call' || member === 'bind'
            ? node.arguments[1] ?? null
            : node.arguments[0] ?? null
          if (argument === null) {
            if (member === 'bind') return
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

        const familyValueSourceOf = (wrapped: ESTree.Node, depth: number): string | null => {
          if (depth > RESOLUTION_DEPTH) return null
          const node = unwrapExpression(wrapped)
          const firstOf = (nodes: readonly (ESTree.Node | null)[]): string | null => {
            for (const item of nodes) {
              if (item === null) continue
              const value = item.type === 'SpreadElement' ? item.argument : item
              const source = familyValueSourceOf(value, depth + 1)
              if (source !== null) return source
            }
            return null
          }
          switch (node.type) {
            case 'ObjectExpression':
              return firstOf(
                node.properties.map((property) => property.type === 'SpreadElement' ? property : property.value),
              )
            case 'ArrayExpression':
              return firstOf(node.elements)
            case 'ConditionalExpression':
              return firstOf([node.consequent, node.alternate])
            case 'LogicalExpression':
              return firstOf([node.left, node.right])
            case 'SequenceExpression':
              return firstOf(node.expressions.slice(-1))
            case 'ArrowFunctionExpression':
            case 'FunctionExpression':
            case 'FunctionDeclaration':
              return firstOf(returnedValuesOf(node))
            default:
              break
          }
          if (node.type === 'MemberExpression') return familyValueSourceOf(node.object, depth + 1)
          if (node.type === 'CallExpression') {
            if (forwardingMemberOf(node.callee) === 'bind' && node.callee.type === 'MemberExpression') {
              return familyValueSourceOf(node.callee.object, depth + 1)
            }
            const source = familyValueSourceOf(node.callee, depth + 1)
            if (source === null) return null
            const origin = forwardedOriginOf(localOriginOf(node.callee, 0))
            return origin !== null && factoryKindOf(origin) === 'fsm' ? null : source
          }
          if (node.type !== 'Identifier') return null
          const definition = variableOf(node, context.sourceCode.getScope)?.defs[0]
          if (definition === undefined) return null
          if (definition.type === 'FunctionName') return familyValueSourceOf(definition.node, depth + 1)
          if (definition.type === 'ImportBinding') {
            const source = origins.get(node.name)?.source
            return source !== undefined && isStateMachineFamilySpecifier(source) ? source : null
          }
          const declarator = definition.node
          if (definition.type !== 'Variable' || declarator.type !== 'VariableDeclarator') return null
          return declarator.init === null ? null : familyValueSourceOf(declarator.init, depth + 1)
        }

        const reportReExport = (node: ESTree.Node, source: string): void => {
          report(node, 'familyReExport', {
            name: REEXPORT_NAME,
            expected: REEXPORT_EXPECTED,
            actual: reExportActual(source),
            fix: REEXPORT_FIX(source),
          })
        }

        const judgeExportedDeclarator = (declarator: ESTree.VariableDeclarator): void => {
          if (declarator.init === null) return
          const source = familyValueSourceOf(declarator.init, 0)
          if (source !== null) reportReExport(declarator, source)
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
            case 'ExportNamedDeclaration': {
              if (node.exportKind === 'type') return
              const declaration = node.declaration
              if (declaration !== null && declaration.type === 'VariableDeclaration') {
                for (const declarator of declaration.declarations) judgeExportedDeclarator(declarator)
                return
              }
              if (declaration !== null && declaration.type === 'FunctionDeclaration') {
                const source = familyValueSourceOf(declaration, 0)
                if (source !== null) reportReExport(declaration, source)
                return
              }
              // Every specifier type-only is a type edge: it carries no machine.
              if (
                node.specifiers.length > 0 &&
                node.specifiers.every((specifier) => specifier.exportKind === 'type')
              ) {
                return
              }
              const source = node.source
              const familySource = source === null
                ? node.specifiers
                  .filter((specifier) => specifier.exportKind !== 'type')
                  .map((specifier) => familyValueSourceOf(specifier.local, 0))
                  .find((found) => found !== null) ?? undefined
                : isStateMachineFamilySpecifier(source.value)
                ? source.value
                : undefined
              if (familySource === undefined) return
              reportReExport(node, familySource)
              return
            }
            case 'ExportDefaultDeclaration': {
              const declaration = node.declaration
              const source = familyValueSourceOf(declaration, 0)
              if (source !== null) reportReExport(declaration, source)
              return
            }
            case 'ExportAllDeclaration': {
              if (node.exportKind === 'type') return
              if (!isStateMachineFamilySpecifier(node.source.value)) return
              reportReExport(node, node.source.value)
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
