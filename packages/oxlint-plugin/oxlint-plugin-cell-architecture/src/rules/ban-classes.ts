import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import { ANONYMOUS_CLASS, EXPECTED, FIX, meta, TEST_OR_FIXTURE_PATH } from './ban-classes.config.js'

export type Options = []

export type MessageIds = 'banned'

/**
 * A class is judged by the expression it extends, never by its name — a name
 * whitelist is an author-supplied token and certifies nothing. The rule reports
 * any class whose `superClass` is absent or does not resolve to one of the
 * sanctioned Effect v4 constructor expressions in `SANCTIONED_BASES`.
 *
 * One honest caveat: the warrant for reporting a bare, superclass-less class is
 * local policy, not "Effect forbids it". Effect v4's own source is full of
 * bare classes (SchemaAST internals, scheduler and pubsub implementations,
 * `BrandError`, `ConfigError`) where the class is a deliberate implementation
 * detail. Reporting one in OUR packages is a decision this codebase makes
 * because Effect v4 itself gives a class-sanctioning expression for the
 * capability, data-model, error-model, and rpc cases — not because the class
 * keyword is intrinsically evil.
 */
const isTestPath = (filename: string): boolean => TEST_OR_FIXTURE_PATH.test(filename)

export const banClasses = defineRule({
  meta,
  create(context: Context) {
    if (isTestPath(context.filename)) return {}
    const report = (node: ESTree.Class, className: string, basePath: string | null): void => {
      context.report({
        node,
        messageId: 'banned',
        data: {
          name: `class ${className}`,
          expected: EXPECTED,
          actual: basePath === null
            ? 'a class whose superclass is not a sanctioned Effect v4 constructor'
            : `a class extending ${basePath}`,
          fix: FIX,
        },
      })
    }

    /**
     * Whether the class is a type-only declaration rather than a runtime one.
     *
     * `declare module '@babel/core' { export class File { … } }` augments a
     * dependency whose published types omit a class its runtime exports. That
     * declaration emits nothing, so it holds no field, runs no constructor and
     * has no instance — none of the harms this rule exists to prevent can occur
     * in it, and there is no alternative spelling to migrate it to.
     *
     * A `namespace Foo { class Bar {} }` without `declare` DOES emit a runtime
     * class, so the ambient flag is read from the ancestor rather than assumed
     * from its being a module at all. A `declare class` at file scope carries
     * the flag on itself and has no ambient ancestor to find, so the node's own
     * flag is read before the walk starts.
     */
    const isAmbientDeclaration = (node: ESTree.Class): boolean => {
      const self: { declare?: unknown } = node
      if (self.declare === true) return true
      let current: unknown = node.parent
      while (current !== undefined && current !== null && typeof current === 'object') {
        const candidate: { type?: unknown; declare?: unknown; parent?: unknown } = current
        if (candidate.type === 'TSModuleDeclaration' && candidate.declare === true) return true
        current = candidate.parent
      }
      return false
    }

    const checkClass = (node: ESTree.Class): void => {
      if (isAmbientDeclaration(node)) return
      const className = node.id === null ? ANONYMOUS_CLASS : node.id.name
      if (node.superClass === null) {
        report(node, className, null)
        return
      }

      if (
        node.superClass.type === 'Identifier' &&
        (node.superClass.name === 'Object' || node.superClass.name === 'Function')
      ) {
        report(node, className, node.superClass.name)
        return
      }
    }

    return {
      ClassDeclaration(node: ESTree.Class) {
        checkClass(node)
      },
      ClassExpression(node: ESTree.Class) {
        checkClass(node)
      },
    }
  },
})
