import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { BRANCHING_NAMES, ITERATION_KEYWORDS, meta } from './workflow-single-path.config.js'

export type MessageIds = 'branchingStatement' | 'iterationStatement' | 'excessTernary'

export const workflowSinglePath = defineRule({
  meta,
  create(context: Context) {
    if (!context.filename.endsWith('.workflow.ts')) return {}

    const ternaries: ESTree.ConditionalExpression[] = []

    return {
      IfStatement(node: ESTree.IfStatement) {
        context.report({
          node,
          messageId: 'branchingStatement',
          data: {
            name: BRANCHING_NAMES.IfStatement,
            expected: 'Match.value(...).pipe(Match.tag(...), Match.exhaustive)',
            actual: 'an if statement',
            fix: 'dispatch exhaustively over a closed tagged union so a new variant fails to compile',
          },
        })
      },
      SwitchStatement(node: ESTree.SwitchStatement) {
        context.report({
          node,
          messageId: 'branchingStatement',
          data: {
            name: BRANCHING_NAMES.SwitchStatement,
            expected: 'Match.value(...).pipe(Match.tag(...), Match.exhaustive)',
            actual: 'a switch statement',
            fix: 'dispatch exhaustively over a closed tagged union so a new variant fails to compile',
          },
        })
      },
      ForStatement(node: ESTree.ForStatement) {
        context.report({
          node,
          messageId: 'iterationStatement',
          data: {
            name: ITERATION_KEYWORDS.ForStatement,
            expected: 'map or fold',
            actual: `a ${ITERATION_KEYWORDS.ForStatement} loop`,
            fix: 'express the repetition as A.map or A.reduce — iteration in the core is one expression',
          },
        })
      },
      ForInStatement(node: ESTree.ForInStatement) {
        context.report({
          node,
          messageId: 'iterationStatement',
          data: {
            name: ITERATION_KEYWORDS.ForInStatement,
            expected: 'map or fold',
            actual: `a ${ITERATION_KEYWORDS.ForInStatement} loop`,
            fix: 'express the repetition as A.map or A.reduce — iteration in the core is one expression',
          },
        })
      },
      ForOfStatement(node: ESTree.ForOfStatement) {
        context.report({
          node,
          messageId: 'iterationStatement',
          data: {
            name: ITERATION_KEYWORDS.ForOfStatement,
            expected: 'map or fold',
            actual: `a ${ITERATION_KEYWORDS.ForOfStatement} loop`,
            fix: 'express the repetition as A.map or A.reduce — iteration in the core is one expression',
          },
        })
      },
      WhileStatement(node: ESTree.WhileStatement) {
        context.report({
          node,
          messageId: 'iterationStatement',
          data: {
            name: ITERATION_KEYWORDS.WhileStatement,
            expected: 'map or fold',
            actual: `a ${ITERATION_KEYWORDS.WhileStatement} loop`,
            fix: 'express the repetition as A.map or A.reduce — iteration in the core is one expression',
          },
        })
      },
      DoWhileStatement(node: ESTree.DoWhileStatement) {
        context.report({
          node,
          messageId: 'iterationStatement',
          data: {
            name: ITERATION_KEYWORDS.DoWhileStatement,
            expected: 'map or fold',
            actual: `a ${ITERATION_KEYWORDS.DoWhileStatement} loop`,
            fix: 'express the repetition as A.map or A.reduce — iteration in the core is one expression',
          },
        })
      },
      ConditionalExpression(node: ESTree.ConditionalExpression) {
        ternaries.push(node)
      },
      'Program:exit'() {
        const [, ...excess] = ternaries
        excess.forEach((node, index) => {
          context.report({
            node,
            messageId: 'excessTernary',
            data: {
              name: 'ternary',
              expected: 'at most one converging ternary per workflow',
              actual: `ternary ${index + 2} of ${ternaries.length}`,
              fix: 'derive a closed variant and dispatch with Match.tag + Match.exhaustive',
            },
          })
        })
      },
    }
  },
})
