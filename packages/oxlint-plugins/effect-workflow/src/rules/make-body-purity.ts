import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  CONTROL_FLOW_BANNED_ACTUAL,
  CONTROL_FLOW_BANNED_EXPECTED,
  CONTROL_FLOW_BANNED_FIX,
  CONTROL_FLOW_KEYWORD_OF,
  IO_FIX,
  IO_GLOBAL_ACTUAL,
  IO_IMPORT_ACTUAL,
  meta,
  MODULE_STATE_ACTUAL,
  MODULE_STATE_FIX,
  MUTABLE_LOCAL_ACTUAL,
  MUTABLE_LOCAL_FIX,
  PURE_BODY_EXPECTED,
  UNRESOLVABLE_ACTUAL,
  UNRESOLVABLE_FIX,
  UNRESOLVABLE_MAKE_ARGUMENT_ACTUAL,
  UNRESOLVABLE_MAKE_ARGUMENT_EXPECTED,
  UNRESOLVABLE_MAKE_ARGUMENT_FIX,
} from './make-body-purity.config.js'
import { collectMakeBoundaries, type MakeBodyKind, type MakeBoundary } from './make-boundary.kernel.js'
import { classifyBodyReferences, isFailingVerdict, type ReferenceVerdict } from './reference-classification.kernel.js'
import { isTestFile } from './workflow-match-exhaustive.config.js'

export type MessageIds =
  | 'ioImportReference'
  | 'ioGlobalReference'
  | 'moduleStateReference'
  | 'mutableLocalReference'
  | 'unresolvableReference'
  | 'controlFlowBanned'
  | 'unresolvableMakeArgument'

const CONTROL_FLOW_TYPES: ReadonlySet<string> = new Set([
  'IfStatement',
  'ConditionalExpression',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
])

const isWalkable = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && 'type' in value

const isNodeLike = (value: unknown): value is ESTree.Node =>
  isWalkable(value) && typeof value['start'] === 'number' && typeof value['end'] === 'number'

/** A defensive guard's branches must end the function immediately. */
const convergesImmediately = (node: ESTree.Node | undefined): boolean =>
  node !== undefined && (node.type === 'ReturnStatement' || node.type === 'ThrowStatement')

const isConvergingGuard = (node: ESTree.Node): boolean => {
  if (node.type !== 'IfStatement') return false
  const consequent = node.consequent
  if (consequent.type !== 'BlockStatement') return convergesImmediately(consequent)
  return consequent.body.length === 1 && convergesImmediately(consequent.body[0])
}

const firstStatementOf = (body: MakeBodyKind): ESTree.Node | undefined =>
  body.type === 'ArrowFunctionExpression' && body.body.type === 'BlockStatement'
    ? body.body.body[0]
    : undefined

/** The single allowed `if`: the block's first statement, converging immediately. */
const isAllowedGuard = (node: ESTree.Node, body: MakeBodyKind): boolean => {
  if (node.type !== 'IfStatement') return false
  const first = firstStatementOf(body)
  return first !== undefined && first === node && isConvergingGuard(node)
}

const verdictOfKind = (verdict: ReferenceVerdict): MessageIds => {
  switch (verdict.kind) {
    case 'ioImport':
      return 'ioImportReference'
    case 'ioGlobal':
      return 'ioGlobalReference'
    case 'moduleState':
      return 'moduleStateReference'
    case 'localMutable':
      return 'mutableLocalReference'
    // The gate `isFailingVerdict` keeps the pass kinds out; the default is
    // unreachable and never carries a report.
    default:
      return 'unresolvableReference'
  }
}

const verdictData = (
  name: string,
  verdict: ReferenceVerdict,
): { readonly name: string; readonly expected: string; readonly actual: string; readonly fix: string } => {
  const referenceName = `a reference to ${name}`
  switch (verdict.kind) {
    case 'ioImport':
      return {
        name: referenceName,
        expected: PURE_BODY_EXPECTED,
        actual: IO_IMPORT_ACTUAL,
        fix: IO_FIX,
      }
    case 'ioGlobal':
      return {
        name: referenceName,
        expected: PURE_BODY_EXPECTED,
        actual: IO_GLOBAL_ACTUAL,
        fix: IO_FIX,
      }
    case 'moduleState':
      return {
        name: referenceName,
        expected: PURE_BODY_EXPECTED,
        actual: MODULE_STATE_ACTUAL,
        fix: MODULE_STATE_FIX,
      }
    case 'localMutable':
      return {
        name: referenceName,
        expected: PURE_BODY_EXPECTED,
        actual: MUTABLE_LOCAL_ACTUAL,
        fix: MUTABLE_LOCAL_FIX,
      }
    default:
      return {
        name: referenceName,
        expected: PURE_BODY_EXPECTED,
        actual: UNRESOLVABLE_ACTUAL,
        fix: UNRESOLVABLE_FIX,
      }
  }
}

/**
 * The KTD3 purity obligations of a `Workflow.make` decision body: references
 * resolve to parameters, const locals, module declarations, or audited-pure
 * imports; the refused set is I/O imports, module state, local mutation,
 * I/O globals, and the honest unknown. Control flow is limited to a single
 * converging first-statement guard; everything else branches and is banned.
 */
export const makeBodyPurity = defineRule({
  meta,
  create(context: Context) {
    if (isTestFile(context.filename)) return {}
    let boundaries: readonly MakeBoundary[] = []
    const reportedSpans = new Set<string>()
    const reportedReferenceKeys = new Set<string>()

    const isNewlyReported = (node: ESTree.Node): boolean => {
      const key = `${node.type}:${node.start}:${node.end}`
      if (reportedSpans.has(key)) return false
      reportedSpans.add(key)
      return true
    }

    const reportReference = (name: string, verdict: ReferenceVerdict, identifier: ESTree.Node): void => {
      if (!isFailingVerdict(verdict) || !isNewlyReported(identifier)) return
      // One report per offending binding, not per reference occurrence: the
      // violation is the binding itself, wherever the decision touches it.
      const bindingKey = `${name}:${verdictOfKind(verdict)}`
      if (reportedReferenceKeys.has(bindingKey)) return
      reportedReferenceKeys.add(bindingKey)
      context.report({
        node: identifier,
        messageId: verdictOfKind(verdict),
        data: verdictData(name, verdict),
      })
    }

    const reportControl = (node: ESTree.Node): void => {
      if (!isNewlyReported(node)) return
      context.report({
        node,
        messageId: 'controlFlowBanned',
        data: {
          name: CONTROL_FLOW_KEYWORD_OF[node.type] ?? 'a banned control-flow construct',
          expected: CONTROL_FLOW_BANNED_EXPECTED,
          actual: CONTROL_FLOW_BANNED_ACTUAL,
          fix: CONTROL_FLOW_BANNED_FIX,
        },
      })
    }

    const reportUnresolvableArgument = (boundary: MakeBoundary): void => {
      if (!isNewlyReported(boundary.makeCall)) return
      context.report({
        node: boundary.makeCall,
        messageId: 'unresolvableMakeArgument',
        data: {
          name: 'the argument of this Workflow.make call',
          expected: UNRESOLVABLE_MAKE_ARGUMENT_EXPECTED,
          actual: UNRESOLVABLE_MAKE_ARGUMENT_ACTUAL,
          fix: UNRESOLVABLE_MAKE_ARGUMENT_FIX,
        },
      })
    }

    const scanControlFlow = (body: MakeBodyKind): void => {
      const walk = (value: unknown, inGuardTest: boolean): void => {
        if (!isWalkable(value)) return
        const node = isNodeLike(value) ? value : null
        if (node === null) return
        const type = value['type']
        if (typeof type !== 'string') return
        if (type === 'LogicalExpression') {
          const operator = value['operator']
          if ((operator === '&&' || operator === '||') && !inGuardTest) {
            reportControl(node)
          }
        } else if (CONTROL_FLOW_TYPES.has(type)) {
          if (type === 'IfStatement' && !inGuardTest && isAllowedGuard(node, body)) {
            // The guard's test may reach for defaults with && / ||; its
            // branches converge immediately and hold no further control flow.
            walk(value['test'], true)
            walk(value['consequent'], false)
            walk(value['alternate'], false)
            return
          }
          reportControl(node)
          return
        }
        for (const key of context.sourceCode.visitorKeys[type] ?? []) {
          const child = value[key]
          if (Array.isArray(child)) {
            for (const entry of child) walk(entry, inGuardTest)
          } else {
            walk(child, inGuardTest)
          }
        }
      }
      walk(body, false)
    }

    return {
      Program() {
        boundaries = collectMakeBoundaries(context)
        if (boundaries.length === 0) return
        for (const boundary of boundaries) {
          const body = boundary.resolvedBody
          if (body === null) {
            reportUnresolvableArgument(boundary)
            continue
          }
          for (const report of classifyBodyReferences(body, context)) {
            reportReference(report.name, report.verdict, report.identifier)
          }
          scanControlFlow(body)
        }
      },
    }
  },
})
