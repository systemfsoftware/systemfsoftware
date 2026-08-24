import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'

import {
  ANONYMOUS_CLASS,
  EXPECTED,
  FIX,
  meta,
  SANCTIONED_BASES,
  SANCTIONED_MODULE,
  SIBLING_RULE_TERRITORY,
  TEST_OR_FIXTURE_PATH,
} from './ban-classes.config.js'

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

const canonicalModule = (source: string): string =>
  source === 'effect' || source.startsWith('effect/') ? SANCTIONED_MODULE : source

/**
 * The namespace segment a namespace import contributes to the resolved path.
 *
 * `import * as Context from 'effect/Context'` binds the MEMBERS of `Context`, so
 * the local name stands for the namespace and `Context.Service` must resolve to
 * `effect/Context.Service`. `import * as Effect from 'effect'` binds the package
 * root instead, so the namespace arrives as the first property access and this
 * contributes nothing.
 *
 * `canonicalModule` collapses both spellings to `effect` because that is what
 * the membership test needs, which destroys exactly this distinction — so it is
 * read from the original specifier here rather than recovered later.
 */
const namespaceSegmentOf = (source: string): string | null =>
  source.startsWith(`${SANCTIONED_MODULE}/`) ? source.slice(SANCTIONED_MODULE.length + 1) : null

export const banClasses = defineRule({
  meta,
  create(context: Context) {
    if (isTestPath(context.filename)) return {}

    const namedBindings = new Map<string, { readonly module: string; readonly namespace: string }>()
    const namespaceImports = new Map<string, string | null>()
    const shadowedLocals = new Set<string>()

    const markShadowed = (name: string): void => {
      if (namedBindings.has(name) || namespaceImports.has(name)) {
        shadowedLocals.add(name)
      }
    }

    /**
     * Resolve an `extends` expression to its rooted, import-resolved dotted
     * path (e.g. `effect/Schema.Class`), or `null` when it does not bottom out
     * in a resolved effect namespace member. Unwraps every call layer (so the
     * double-call `Context.Service<Self>()('Tag')`, the single-call
     * `Context.Reference<Shape>('key', { defaultValue })`, the type-argument
     * wrapper `Data.Class<Props>`, and the bare member `Pipeable.Class` all
     * land on the same root MemberExpression) and ignores computed access.
     */
    const resolveBasePath = (superClass: ESTree.Expression): string | null => {
      let node: ESTree.Expression = superClass
      for (;;) {
        if (node.type === 'CallExpression') {
          node = node.callee
          continue
        }
        if (node.type === 'TSInstantiationExpression') {
          node = node.expression
          continue
        }
        break
      }

      const segments: Array<string> = []
      while (node.type === 'MemberExpression') {
        if (node.computed || node.property.type !== 'Identifier') return null
        segments.unshift(node.property.name)
        node = node.object
      }
      if (node.type !== 'Identifier') return null

      const localName = node.name
      if (shadowedLocals.has(localName)) return null

      const binding = namedBindings.get(localName)
      if (binding !== undefined) {
        return segments.length > 0 ? `${binding.module}/${binding.namespace}.${segments.join('.')}` : null
      }

      if (namespaceImports.has(localName)) {
        const namespace = namespaceImports.get(localName) ?? null
        // A deep import (`effect/Context`) already names the namespace, so the
        // member is the only segment the extends-expression needs to supply. A
        // root import (`effect`) supplies the namespace as its first segment,
        // which needs at least two.
        const path = namespace === null
          ? `${SANCTIONED_MODULE}/${segments.join('.')}`
          : `${SANCTIONED_MODULE}/${namespace}.${segments.join('.')}`
        const required = namespace === null ? 2 : 1
        return segments.length >= required ? path : null
      }

      return null
    }

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

      const basePath = resolveBasePath(node.superClass)
      if (basePath === null) {
        report(node, className, null)
        return
      }

      if (SANCTIONED_BASES.has(basePath)) return
      if (SIBLING_RULE_TERRITORY.has(basePath)) return

      report(node, className, basePath)
    }

    return {
      ImportDeclaration(node: ESTree.ImportDeclaration) {
        const module = canonicalModule(node.source.value)
        for (const spec of node.specifiers) {
          if (spec.type === 'ImportSpecifier' && spec.imported.type === 'Identifier') {
            namedBindings.set(spec.local.name, { module, namespace: spec.imported.name })
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            if (module === SANCTIONED_MODULE) {
              namespaceImports.set(spec.local.name, namespaceSegmentOf(node.source.value))
            }
          } else {
            markShadowed(spec.local.name)
          }
        }
      },

      VariableDeclaration(node: ESTree.VariableDeclaration) {
        for (const decl of node.declarations) {
          if (decl.id.type === 'Identifier') {
            markShadowed(decl.id.name)
          }
        }
      },

      FunctionDeclaration(node: ESTree.Function) {
        if (node.id !== null) {
          markShadowed(node.id.name)
        }
      },

      ClassDeclaration(node: ESTree.Class) {
        if (node.id !== null) {
          markShadowed(node.id.name)
        }
        checkClass(node)
      },

      ClassExpression(node: ESTree.Class) {
        if (node.id !== null) {
          markShadowed(node.id.name)
        }
        checkClass(node)
      },
    }
  },
})
