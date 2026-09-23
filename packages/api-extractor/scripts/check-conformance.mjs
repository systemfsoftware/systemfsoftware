#!/usr/bin/env node
// Per-file, per-rule conformance check against compound-packs/cell-architecture,
// compound-packs/boundary-testing, and skill://architect-property-tests.
//
// Every source and test file is judged by every applicable rule. A rule the
// file does not fall under records `n/a`; a rule with any hit records `fail`.
// `--ledger` prints the full file-by-rule matrix; the default prints only the
// failures. Exit status is 1 when any file fails any rule.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const K = ts.SyntaxKind
const rootFlag = process.argv.indexOf('--root')
const packageRoot = rootFlag === -1
  ? fileURLToPath(new URL('..', import.meta.url))
  : resolve(process.argv[rootFlag + 1])

const walk = (dir) =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? walk(path) : [path]
    })
    : []

const isTestFile = (file) => /(^tests\/|\/__tests__\/|\.test\.ts$)/.test(file)
const isResourceModule = (file) => file.endsWith('.resource.ts') || file.endsWith('.handle.ts')
const isInSourceTestBlock = (node) =>
  ts.isIfStatement(node) && node.expression.getText().startsWith('import.meta.vitest')
const isFixture = (file) => file.startsWith('tests/__fixtures__/')
const isShell = (file) =>
  file.endsWith('.cell.ts') || isResourceModule(file) || file.startsWith('src/drivers/') || file === 'src/cli.ts' ||
  file.startsWith('src/cli/')

const files = [...walk(join(packageRoot, 'src')), ...walk(join(packageRoot, 'tests'))]
  .map((path) => relative(packageRoot, path))
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts') && !isFixture(file))
  .toSorted((left, right) => (left < right ? -1 : Number(left > right)))

const SANCTIONED_BASE =
  /^(Schema|S)\.(Class|TaggedClass|TaggedError|ErrorClass|Opaque)\b|^Data\.(Class|TaggedClass|Error)\b|^Context\.(Service|Reference)\b/
const MUTATING_METHODS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
  'copyWithin',
  'set',
  'add',
  'delete',
  'clear',
])
const MUTABLE_CONSTRUCTORS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet', 'Array'])
const NODE_MODULE = /^(node:|fs$|path$|os$|child_process$|url$|process$)/
const EFFECT_IO_MODULE = /^effect\/(FileSystem|Path|Terminal|Command|ChildProcess)$/
const MOCK_CALL = /^vi\.(mock|doMock|fn|spyOn|stubGlobal|stubEnv)$/
const RAW_FASTCHECK = /^fc\.(assert|property|check|asyncProperty)$/
const RUN_EDGE =
  /^(Effect\.(runSync|runPromise|runFork|runCallback|runSyncExit|runPromiseExit|orDie)|(Option|Result|Effect)\.getOrThrow(With)?)$/
const PROVIDE_EDGE = /^(Layer\.\w+|Effect\.(provide|provideService|scoped|acquireRelease)|Cell\.provide)$/

const rootIdentifier = (node) => {
  let cursor = node
  while (ts.isPropertyAccessExpression(cursor) || ts.isCallExpression(cursor)) {
    cursor = ts.isPropertyAccessExpression(cursor) ? cursor.expression : cursor.expression
  }
  return ts.isIdentifier(cursor) ? cursor.text : undefined
}

const isNamespaceReceiver = (expression) => {
  const root = rootIdentifier(expression)
  return root !== undefined && /^[A-Z]/.test(root)
}

const isPropertyCallback = (node) => {
  const parent = node.parent
  if (!parent || !ts.isCallExpression(parent)) return false
  const callee = parent.expression.getText()
  return /(^|\.)prop$/.test(callee) && parent.arguments.at(-1) === node
}

const collect = (file, sourceFile) => {
  const hits = {}
  const hit = (rule, node, detail) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    ;(hits[rule] ??= []).push(`${line + 1}: ${detail ?? node.getText(sourceFile).split('\n')[0].slice(0, 80)}`)
  }
  const test = isTestFile(file)
  const shell = isShell(file)

  const visit = (node, insideProperty) => {
    if (isInSourceTestBlock(node)) return
    const inProp = insideProperty ||
      ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && isPropertyCallback(node))

    if (!test) {
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        const base = node.heritageClauses?.find((clause) => clause.token === K.ExtendsKeyword)?.types[0]?.expression
        if (base === undefined || !SANCTIONED_BASE.test(base.getText(sourceFile))) {
          hit('ban-classes', node, `class ${node.name?.text ?? '<anonymous>'}`)
        }
      }
      if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.BlockScoped) !== ts.NodeFlags.Const) {
        hit('no-let', node)
      }
      if (ts.isIterationStatement(node, false)) hit('no-loop', node)
      if (!shell && (ts.isIfStatement(node) || ts.isSwitchStatement(node) || ts.isConditionalExpression(node))) {
        hit('no-branch-outside-shell', node)
      }
      if (
        ts.isBinaryExpression(node) && node.operatorToken.kind >= K.FirstAssignment &&
        node.operatorToken.kind <= K.LastAssignment
      ) hit('no-mutation', node)
      if (
        (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        (node.operator === K.PlusPlusToken || node.operator === K.MinusMinusToken)
      ) hit('no-mutation', node)
      if (ts.isDeleteExpression(node)) hit('no-mutation', node)
      if (
        ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        MUTATING_METHODS.has(node.expression.name.text) && !isNamespaceReceiver(node.expression.expression)
      ) hit('no-mutation', node)
      if (
        ts.isNewExpression(node) && ts.isIdentifier(node.expression) && MUTABLE_CONSTRUCTORS.has(node.expression.text)
      ) hit('no-mutation', node)
      if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.startsWith('effect/Mutable')) {
        hit('no-mutation', node)
      }
      if (ts.isAsExpression(node) && node.type.getText(sourceFile) !== 'const') hit('decode-never-cast', node)
      if (ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)) hit('decode-never-cast', node)
      if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'JSON.parse') {
        hit('decode-never-cast', node)
      }
      if (ts.isThrowStatement(node) || ts.isTryStatement(node)) hit('no-throw', node)
      if (
        ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'localeCompare'
      ) hit('no-hand-comparator', node)
      if (
        (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.parameters.length === 2 &&
        /(^|[^\w.])-1\b/.test(node.body.getText(sourceFile))
      ) hit('no-hand-comparator', node)
      const driverInterop = file.startsWith('src/drivers/') || file.endsWith('.handle.ts')
      if (
        !driverInterop && ts.isFunctionLike(node) &&
        node.modifiers?.some((modifier) => modifier.kind === K.AsyncKeyword)
      ) hit('no-async', node)
      if (!driverInterop && (ts.isAwaitExpression(node) || (ts.isIdentifier(node) && node.text === 'Promise'))) {
        hit('no-async', node)
      }
      if (ts.isCallExpression(node) && RUN_EDGE.test(node.expression.getText(sourceFile)) && file !== 'src/cli.ts') {
        hit('run-edge', node)
      }
      if (!shell) {
        if (
          ts.isImportDeclaration(node) && node.importClause?.phaseModifier !== K.TypeKeyword &&
          (NODE_MODULE.test(node.moduleSpecifier.text) || EFFECT_IO_MODULE.test(node.moduleSpecifier.text))
        ) hit('io-in-cell-phases', node)
        if (
          ts.isIdentifier(node) && ['process', 'console'].includes(node.text) &&
          !ts.isPropertyAccessExpression(node.parent)
        ) hit('io-in-cell-phases', node)
        if (
          ts.isPropertyAccessExpression(node) && ['sys', 'now', 'random'].includes(node.name.text) &&
          ['ts', 'Ts', 'Date', 'Math'].includes(node.expression.getText(sourceFile))
        ) hit('io-in-cell-phases', node)
        if (
          ts.isPropertyAccessExpression(node) && ['process', 'console'].includes(node.expression.getText(sourceFile))
        ) hit('io-in-cell-phases', node)
      }
      if (
        ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'run' &&
        !(file === 'src/cli.ts' || file.startsWith('src/cli/') || file.endsWith('.resource.ts'))
      ) hit('compose-not-run', node)
      if (
        ts.isCallExpression(node) && PROVIDE_EDGE.test(node.expression.getText(sourceFile)) &&
        !(file === 'src/cli.ts' || file.startsWith('src/drivers/') || file.endsWith('.resource.ts'))
      ) hit('layers-at-root', node)
    }

    if (test) {
      if (ts.isCallExpression(node) && MOCK_CALL.test(node.expression.getText(sourceFile))) hit('no-mocks', node)
      if (ts.isCallExpression(node) && RAW_FASTCHECK.test(node.expression.getText(sourceFile))) {
        hit('property-file-purity', node)
      }
      if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'fast-check') hit('property-file-purity', node)
      if (
        ts.isCallExpression(node) && /(^|\.)prop$/.test(node.expression.getText(sourceFile)) &&
        !file.endsWith('.property.test.ts')
      ) hit('property-file-purity', node)
      if (
        ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'filter' &&
        /\bfc\.|Arbitrary\b/.test(node.expression.expression.getText(sourceFile))
      ) hit('no-filter-arbitrary', node)
      if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === 'fc.pre') {
        hit('no-filter-arbitrary', node)
      }
      if (ts.isPropertyAssignment(node) && node.name.getText(sourceFile) === 'numRuns') hit('no-numruns-literal', node)
      if (
        ts.isCallExpression(node) &&
        /^(Arbitrary\.(make|schema)|Schema\.toArbitrary|toArbitrary)$/.test(node.expression.getText(sourceFile))
      ) hit('schema-is-arbitrary', node)
      if (inProp) {
        if (ts.isCallExpression(node) && /^(expect|assert\w*)$/.test(rootIdentifier(node.expression) ?? '')) {
          hit('property-boolean-verdict', node)
        }
        if (ts.isIfStatement(node) || ts.isThrowStatement(node)) hit('property-boolean-verdict', node)
        if (ts.isReturnStatement(node) && node.expression === undefined) hit('property-boolean-verdict', node)
        if (
          (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && isPropertyCallback(node) &&
          ts.isBlock(node.body) && !ts.isReturnStatement(node.body.statements.at(-1) ?? node.body)
        ) hit('property-boolean-verdict', node, 'predicate does not end in return <boolean>')
      }
    }

    ts.forEachChild(node, (child) => visit(child, inProp))
  }
  visit(sourceFile, false)

  if (!test) {
    const text = sourceFile.getFullText()
    if (file.endsWith('.cell.ts') && !text.includes('Sandwich.named(')) {
      hit('cells-are-sandwiches', sourceFile, 'cell file without Sandwich.named')
    }
    if (file.endsWith('.workflow.ts') && !/Workflow\.(make|total)\(/.test(text)) {
      hit('workflow-shape', sourceFile, 'workflow file without Workflow.make/total')
    }
    if (file.endsWith('.workflow.ts') && /from 'effect\/Effect'|from 'effect'.*\bEffect\b/.test(text)) {
      hit('workflow-shape', sourceFile, 'workflow imports Effect')
    }
    if (file.endsWith('.service.ts') && /\bLayer\b/.test(text)) {
      hit('ports-separate', sourceFile, 'service file references Layer')
    }
    if (file === 'src/index.ts' && text.trim() !== "export * as Extractor from './Extractor/mod.js'") {
      hit('single-namespace-barrel', sourceFile, 'index.ts is not the single namespace line')
    }
    if (
      file === 'src/Extractor/mod.ts' && sourceFile.statements.some((statement) => !ts.isExportDeclaration(statement))
    ) hit('single-namespace-barrel', sourceFile, 'mod.ts holds more than re-exports')
  }
  return hits
}

const SOURCE_RULES = [
  'ban-classes',
  'no-let',
  'no-loop',
  'no-branch-outside-shell',
  'no-mutation',
  'decode-never-cast',
  'no-throw',
  'no-hand-comparator',
  'no-async',
  'run-edge',
  'io-in-cell-phases',
  'compose-not-run',
  'layers-at-root',
  'cells-are-sandwiches',
  'workflow-shape',
  'ports-separate',
  'single-namespace-barrel',
]
const TEST_RULES = [
  'no-mocks',
  'property-file-purity',
  'property-boolean-verdict',
  'no-filter-arbitrary',
  'no-numruns-literal',
  'schema-is-arbitrary',
]

const ledger = files.map((file) => {
  const sourceFile = ts.createSourceFile(
    file,
    readFileSync(join(packageRoot, file), 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )
  const hits = collect(file, sourceFile)
  const rules = isTestFile(file) ? TEST_RULES : SOURCE_RULES
  return { file, verdicts: Object.fromEntries(rules.map((rule) => [rule, hits[rule] ?? []])) }
})

const failing = ledger.filter((entry) => Object.values(entry.verdicts).some((hits) => hits.length > 0))

if (process.argv.includes('--ledger')) {
  for (const entry of ledger) {
    const verdicts = Object.entries(entry.verdicts).map(([rule, hits]) =>
      `${rule}=${hits.length === 0 ? 'pass' : `FAIL(${hits.length})`}`
    )
    process.stdout.write(`${entry.file}\t${verdicts.join(' ')}\n`)
  }
} else {
  for (const entry of failing) {
    for (const [rule, hits] of Object.entries(entry.verdicts)) {
      for (const detail of hits.slice(0, 5)) process.stdout.write(`${entry.file}:${detail}  [${rule}]\n`)
      if (hits.length > 5) process.stdout.write(`${entry.file}: … ${hits.length - 5} more  [${rule}]\n`)
    }
  }
}
process.stdout.write(`conformance: ${ledger.length - failing.length}/${ledger.length} files pass every rule\n`)
process.exitCode = failing.length === 0 ? 0 : 1
