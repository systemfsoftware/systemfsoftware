import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import {
  meta,
  NO_SUBJECT_IMPORT_ACTUAL,
  NO_SUBJECT_IMPORT_EXPECTED,
  NO_SUBJECT_IMPORT_FIX,
  NO_SUBJECT_IMPORT_NAME,
} from './behaviour-exercises-use-case.config.js'
import { FOREIGN_RUNNERS, GHERKIN_PACKAGE, INTEGRATION_SUFFIX } from './path.config.js'
import { basenameOf } from './path.js'

export type MessageIds = 'noSubjectImport'

const EFFECT_PACKAGE = 'effect' as const

const FOUNDATION_PACKAGES: ReadonlySet<string> = new Set([...FOREIGN_RUNNERS, GHERKIN_PACKAGE, EFFECT_PACKAGE])

/**
 * The runner, the spec DSL and effect itself - the scaffolding every behaviour
 * file imports. `effect/testing` and every other subpath counts too: a subpath
 * is still the same dependency, and admitting it would let a file satisfy the
 * rule by importing an arbitrary. A `node:` builtin is scaffolding as well: it
 * is part of the environment, not of the package, and a file whose only
 * non-runner import is `node:assert` still never touches the package under
 * test. Whether `node:child_process` legitimately reaches a CLI's behaviour is
 * a decision for the file's other imports - the builtin itself never does.
 *
 * The gherkin spec package is scaffolding for every other package's tests. A
 * behaviour file that lives inside that package and imports the package name
 * is exercising the package under test, not importing a runner.
 */
const isGherkinPackageTree = (filename: string): boolean =>
  filename.includes('/gherkin/effect/') || filename.includes('/effect-gherkin-spec/')

const isFoundationImport = (source: string, filename: string): boolean => {
  if (source === GHERKIN_PACKAGE && isGherkinPackageTree(filename)) return false
  return (
    FOUNDATION_PACKAGES.has(source) ||
    source.startsWith(`${EFFECT_PACKAGE}/`) ||
    source.startsWith('node:')
  )
}

const isBehaviourTest = (basename: string): boolean => basename.endsWith(INTEGRATION_SUFFIX)

/** The stem of a path with its final extension stripped, for identity comparisons. */
const stemOf = (file: string): string => file.replace(/\.[^/]+$/, '')

/**
 * A relative module specifier resolved against the linted file's directory,
 * with `..` segments collapsed. Existence is never checked: one file cannot
 * know what else is on disk (OX-TS2), so only the lexical identity is decided.
 */
const sourceResolvesToItself = (source: string, filename: string): boolean => {
  if (!source.startsWith('.')) return false
  if (source.startsWith('/')) return false
  const directory = filename.slice(0, Math.max(0, filename.lastIndexOf('/')))
  const stack = directory.split('/')
  for (const segment of source.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (stack.length > 0) stack.pop()
    } else {
      stack.push(segment)
    }
  }
  return stemOf(stack.join('/')) === stemOf(filename)
}

/**
 * `import type` is erased before anything executes; `import { type X, Y }` still
 * binds the value `Y`. Zero specifiers is a side-effect import - it executes the
 * module it names, so it reaches whatever that module is.
 */
const hasRuntimeSpecifier = (statement: ESTree.ImportDeclaration): boolean => {
  if (statement.specifiers.length === 0) return true
  return statement.specifiers.some((spec) => !(spec.type === 'ImportSpecifier' && spec.importKind === 'type'))
}

/**
 * A path segment naming the package's build output. Keyed on the emitted directory
 * rather than a filename, so a renamed entry is followed automatically.
 */
const DIST_SEGMENT = /(?:^|\/)dist\//

/**
 * Reports a behaviour file that reaches no package code at all.
 *
 * This deliberately stops short of the convention it serves. The convention is
 * that a behaviour test drives a real use case through the I/O sandwich, and the
 * earlier form of this rule claimed to enforce it by requiring an import whose
 * basename ended in `Executor`, `Handler`, `Adapter`, `Store` or `Middleware`.
 * A probe settled that: a pure kernel named `ZzPureAdapter.ts`, imported by a
 * behaviour test that touched nothing else, was admitted in silence. The gate
 * read a filename its own author chose, so renaming a kernel bought a pass and
 * nothing recomputed whether the module did any I/O. Which side of the sandwich
 * an imported module sits on is not decidable from the importing file's syntax -
 * one file holds no cross-file or type information - so the rule states the part
 * that is: whether the file reaches the package under test. That the reached
 * module is a shell is a review matter, and the role word in a shell module's
 * name documents it for the reader without pretending to be evidence.
 *
 * What counts as reaching: a runtime import from anything that is not the
 * scaffolding - vitest, @effect/vitest, the gherkin spec package, effect or a
 * subpath of it, or a Node builtin - and not the test file itself, or a dynamic
 * `import(...)` of such a source. Type-only specifiers are erased and never
 * count; a side-effect import (`import "./x.js"`, `import {} from "./x.js"`)
 * executes its module and counts for whatever that module is. Whether a named
 * module actually exists is not observable from one file, so an import whose
 * path names nothing satisfies the rule the same way a real one does.
 */
export const behaviourExercisesUseCase = defineRule({
  meta,
  create(context: Context) {
    let reached = false
    return {
      ImportExpression(node: ESTree.ImportExpression) {
        if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') {
          // A dynamic import whose source is not a literal can reach anything;
          // never report on an unknown.
          reached = true
          return
        }
        if (!isFoundationImport(node.source.value, context.filename)) reached = true
      },
      Literal(node: ESTree.StringLiteral) {
        // The package's own emitted output. Some defects exist ONLY in the built
        // module layout - a bundler hoisting a worker's self-detecting entry guard
        // into a shared chunk, so the forked child constructs nothing and exits 0 -
        // and a test that imported `src/` could not observe them by construction.
        // Forking or loading `dist/` reaches the package through the artifact its
        // consumers actually run, which is the strongest reach there is, so it
        // satisfies the rule the way a source import does.
        if (typeof node.value === 'string' && DIST_SEGMENT.test(node.value)) reached = true
      },
      'Program:exit'(node: ESTree.Program) {
        if (!isBehaviourTest(basenameOf(context.filename))) return
        if (reached) return
        for (const statement of node.body) {
          if (statement.type !== 'ImportDeclaration') continue
          if (statement.importKind === 'type') continue
          const source = statement.source.value
          if (isFoundationImport(source, context.filename)) continue
          if (sourceResolvesToItself(source, context.filename)) continue
          if (!hasRuntimeSpecifier(statement)) continue
          return
        }
        context.report({
          node: node.body[0] ?? node,
          messageId: 'noSubjectImport',
          data: {
            name: NO_SUBJECT_IMPORT_NAME,
            expected: NO_SUBJECT_IMPORT_EXPECTED,
            actual: NO_SUBJECT_IMPORT_ACTUAL,
            fix: NO_SUBJECT_IMPORT_FIX,
          },
        })
      },
    }
  },
})
