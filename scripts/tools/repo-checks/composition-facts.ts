// The objective facts of the composition gates, read from the real tools and never from source text: the
// TypeScript compiler (a program per unit, built from the unit's own tsconfig and its moduleResolution), the
// package.json exports resolver (package-exports.ts), and the syntax tree. A fact here is "this import
// declaration resolves to that unit", "this parameter has a Cloudflare Env type", "this call is a member of
// effect's Layer module", never "this line matches a pattern". Judgement calls are not made here: they take
// these facts as evidence (composition-judge.ts).
import { basename, dirname, join, relative, resolve } from '@std/path'
import { isBuiltin } from 'node:module'
import ts from 'typescript'
import { exportsMapOf, isBuildOutput, type Json, resolveExports, targetsOf } from './package-exports.ts'
import { exists, parseJsonObject } from './verdict.ts'
import { readWorkspace, workspacePackageDirs } from './workspace.ts'

export type Kind = 'library' | 'application' | 'template'
const KINDS: readonly string[] = ['library', 'application', 'template']
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'build', '.turbo', '.git', '.alchemy', '.wrangler'])
const TEST_DIRS = new Set(['__tests__', 'tests', 'test', 'e2e'])
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts']
const DEFAULT_CONDITIONS = ['types', 'import', 'node', 'default']
const BUNDLER_CONFIGS = new Set(['vite', 'vitest', 'astro'])
const RUNTIME_PACKAGES = new Set(['react', 'react-dom', 'astro', 'vite', 'next', 'vue', 'svelte', 'solid-js', 'preact'])

export interface ImportFact {
  readonly specifier: string
  /** Declared with `import type`, `export type`, or only type specifiers: erased at runtime. */
  readonly typeOnly: boolean
  readonly via: 'import' | 'export' | 'dynamic' | 'require' | 'import-equals' | 'import-type'
  readonly line: number
  /** The workspace package a bare specifier names, through the exports map of that package. */
  readonly workspace?: {
    readonly unit: string
    readonly subpath: string
    readonly key: string | undefined
    readonly exported: boolean
  }
  /** The file the compiler resolved a relative or aliased specifier to. */
  readonly resolvedFile?: string
  /** The other unit whose directory the resolved file sits in, reached by path rather than by its exports. */
  readonly intoUnit?: string
}

export interface EnvFact {
  readonly kind: 'process.env' | 'Deno.env' | 'import.meta.env' | 'cloudflare-env'
  readonly line: number
}

export interface LayerFact {
  readonly member: string
  readonly line: number
}

export interface SourceFile {
  readonly path: string
  readonly rel: string
  readonly isTest: boolean
  /** vitest.config.ts and kin configure tools: they are not the unit's code. */
  readonly isToolConfig: boolean
  readonly imports: readonly ImportFact[]
  readonly env: readonly EnvFact[]
  readonly layers: readonly LayerFact[]
}

export interface PathAlias {
  readonly config: string
  readonly alias: string
  readonly target: string
}

export interface Unit {
  readonly dir: string
  readonly rel: string
  readonly name: string
  readonly manifest: Json
  readonly kind: Kind | undefined
  readonly files: readonly SourceFile[]
  readonly pathAliases: readonly PathAlias[]
  readonly bundlerAliases: readonly PathAlias[]
  readonly conditions: readonly string[]
  readonly hasInternalFolder: boolean
  /** Bare specifiers the compiler could not resolve to a file (the package is not installed), so types behind them are unknown. */
  readonly unresolved: readonly string[]
  /** The deploy configs at the unit's root (wrangler.*, Dockerfile*): a unit with one is deployed, not imported. */
  readonly deployConfigs: readonly string[]
}

export interface Workspace {
  readonly root: string
  readonly units: readonly Unit[]
  readonly byName: ReadonlyMap<string, Unit>
}

// ------------------------------------------------------------- file layout

const isTestPath = (rel: string): boolean => {
  const segments = rel.split('/')
  const parts = segments[segments.length - 1]!.split('.')
  return segments.slice(0, -1).some((s) => TEST_DIRS.has(s)) ||
    parts.slice(1, -1).some((p) => p === 'test' || p === 'spec')
}

const isToolConfigPath = (rel: string): boolean => {
  const parts = basename(rel).split('.')
  return parts.length >= 3 && parts[1] === 'config'
}

interface Found {
  readonly sources: string[]
  readonly declarations: string[]
  readonly tsconfigs: string[]
  readonly bundlerConfigs: string[]
}

const walk = async (dir: string, top: boolean, out: Found, nested: ReadonlySet<string>): Promise<void> => {
  for await (const entry of Deno.readDir(dir)) {
    const path = join(dir, entry.name)
    if (entry.isDirectory) {
      if (!SKIPPED_DIRS.has(entry.name) && !nested.has(path)) await walk(path, false, out, nested)
      continue
    }
    if (!entry.isFile) continue
    if (top && entry.name.startsWith('tsconfig') && entry.name.endsWith('.json')) out.tsconfigs.push(path)
    if (top && BUNDLER_CONFIGS.has(entry.name.split('.')[0]!) && isToolConfigPath(entry.name)) {
      out.bundlerConfigs.push(path)
    }
    if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue
    if (entry.name.endsWith('.d.ts') || entry.name.endsWith('.d.mts') || entry.name.endsWith('.d.cts')) {
      out.declarations.push(path)
    } else out.sources.push(path)
  }
}

// --------------------------------------------------------------- tsconfigs

interface Compiler {
  readonly options: ts.CompilerOptions
  readonly conditions: readonly string[]
  readonly pathAliases: readonly PathAlias[]
}

const readTsconfig = (path: string): ts.ParsedCommandLine | undefined => {
  const read = ts.readConfigFile(path, ts.sys.readFile)
  if (read.error !== undefined || read.config === undefined) return undefined
  const config = { ...read.config, include: [], files: [], references: undefined }
  return ts.parseJsonConfigFileContent(config, ts.sys, dirname(path), undefined, path)
}

/** The unit's compiler options (its tsconfig.json, else the first sibling that sets a module resolution), its custom conditions and its path aliases. */
const compilerOf = (tsconfigs: readonly string[], dir: string): Compiler => {
  const parsed = [...tsconfigs].sort().map((path) => ({ path, parsed: readTsconfig(path) })).filter((p) =>
    p.parsed !== undefined
  )
  const primary = parsed.find((p) => p.path === join(dir, 'tsconfig.json'))?.parsed?.options ?? {}
  const sibling = parsed.map((p) => p.parsed!.options).find((o) => o.moduleResolution !== undefined)
  const options: ts.CompilerOptions = {
    ...(primary.moduleResolution === undefined
      ? { ...sibling, ...primary, moduleResolution: sibling?.moduleResolution }
      : primary),
  }
  if (options.moduleResolution === undefined) {
    options.moduleResolution = ts.ModuleResolutionKind.Bundler
    options.module = ts.ModuleKind.ESNext
  }
  const conditions = new Set<string>()
  const pathAliases: PathAlias[] = []
  for (const { path, parsed: p } of parsed) {
    for (const condition of p!.options.customConditions ?? []) conditions.add(condition)
    const base = p!.options.pathsBasePath
    for (const [alias, targets] of Object.entries(p!.options.paths ?? {})) {
      for (const target of targets) {
        pathAliases.push({
          config: path,
          alias,
          target: resolve(typeof base === 'string' ? base : dirname(path), target),
        })
      }
    }
  }
  return { options, conditions: [...conditions], pathAliases }
}

/** Every string inside the `alias` property of a bundler config, from the syntax tree. */
const bundlerAliasesOf = async (path: string, dir: string): Promise<readonly PathAlias[]> => {
  const source = ts.createSourceFile(path, await Deno.readTextFile(path), ts.ScriptTarget.Latest, false)
  const found: PathAlias[] = []
  const strings = (node: ts.Node, alias: string): void => {
    if (ts.isStringLiteralLike(node)) {
      found.push({ config: path, alias, target: node.text.startsWith('.') ? resolve(dir, node.text) : node.text })
    }
    ts.forEachChild(node, (child) => strings(child, alias))
  }
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) &&
      node.name.text === 'alias'
    ) {
      strings(node.initializer, 'alias')
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

// ------------------------------------------------------------ syntax facts

const lineOf = (file: ts.SourceFile, node: ts.Node): number =>
  file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1

const allSpecifiersTypeOnly = (elements: readonly { readonly isTypeOnly: boolean }[]): boolean =>
  elements.length > 0 && elements.every((e) => e.isTypeOnly)

interface RawImport {
  readonly specifier: string
  readonly typeOnly: boolean
  readonly via: ImportFact['via']
  readonly line: number
}

const rawImports = (file: ts.SourceFile): readonly RawImport[] => {
  const found: RawImport[] = []
  const add = (node: ts.Node, specifier: string, typeOnly: boolean, via: ImportFact['via']) =>
    found.push({ specifier, typeOnly, via, line: lineOf(file, node) })
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause
      const named = clause?.namedBindings
      const typeOnly = clause !== undefined && (clause.isTypeOnly ||
        (clause.name === undefined && named !== undefined && ts.isNamedImports(named) &&
          allSpecifiersTypeOnly(named.elements)))
      add(node, node.moduleSpecifier.text, typeOnly, 'import')
    } else if (
      ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const clause = node.exportClause
      const typeOnly = node.isTypeOnly ||
        (clause !== undefined && ts.isNamedExports(clause) && allSpecifiersTypeOnly(clause.elements))
      add(node, node.moduleSpecifier.text, typeOnly, 'export')
    } else if (
      ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      add(node, node.moduleReference.expression.text, node.isTypeOnly, 'import-equals')
    } else if (ts.isCallExpression(node) && node.arguments.length >= 1 && ts.isStringLiteralLike(node.arguments[0]!)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        add(node, (node.arguments[0] as ts.StringLiteralLike).text, false, 'dynamic')
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        add(node, (node.arguments[0] as ts.StringLiteralLike).text, false, 'require')
      }
    } else if (
      ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteralLike(node.argument.literal)
    ) {
      add(node, node.argument.literal.text, true, 'import-type')
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

// ---------------------------------------------------- symbols and aliases

const unwrap = (expr: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isNonNullExpression(expr) ||
    ts.isSatisfiesExpression(expr)
    ? unwrap(expr.expression)
    : expr

const moduleOf = (node: ts.Node | undefined): string | undefined =>
  node !== undefined && (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier !== undefined && ts.isStringLiteralLike(node.moduleSpecifier)
    ? node.moduleSpecifier.text
    : undefined

/** What an alias declaration (an import or a re-export) names: the module it reads from and the export it takes. */
const aliasSource = (declaration: ts.Declaration): { readonly module: string; readonly name: string } | undefined => {
  if (ts.isImportSpecifier(declaration)) {
    const module = moduleOf(declaration.parent.parent.parent)
    return module === undefined ? undefined : { module, name: (declaration.propertyName ?? declaration.name).text }
  }
  if (ts.isExportSpecifier(declaration)) {
    const module = moduleOf(declaration.parent.parent)
    return module === undefined ? undefined : { module, name: (declaration.propertyName ?? declaration.name).text }
  }
  if (ts.isNamespaceImport(declaration)) {
    const module = moduleOf(declaration.parent.parent)
    return module === undefined ? undefined : { module, name: '*' }
  }
  if (ts.isNamespaceExport(declaration)) {
    const module = moduleOf(declaration.parent.parent)
    return module === undefined ? undefined : { module, name: '*' }
  }
  if (ts.isImportClause(declaration)) {
    const module = moduleOf(declaration.parent)
    return module === undefined ? undefined : { module, name: 'default' }
  }
  return undefined
}

/** The package.json name nearest above a file: which package a resolved file belongs to. */
const packageNames = new Map<string, string | undefined>()
const packageNameOf = (dir: string): string | undefined => {
  if (packageNames.has(dir)) return packageNames.get(dir)
  let name: string | undefined
  const manifest = ts.sys.readFile(join(dir, 'package.json'))
  if (manifest !== undefined) {
    try {
      const parsed: unknown = JSON.parse(manifest)
      if (typeof parsed === 'object' && parsed !== null && 'name' in parsed && typeof parsed.name === 'string') {
        name = parsed.name
      }
    } catch { /* an unreadable manifest names nothing */ }
  } else if (dirname(dir) !== dir) name = packageNameOf(dirname(dir))
  packageNames.set(dir, name)
  return name
}

/** Whether a source file is the module `Layer` of the package `effect`, by where the compiler resolved it. */
const isEffectLayerFile = (file: ts.SourceFile): boolean =>
  basename(file.fileName).split('.')[0] === 'Layer' && packageNameOf(dirname(file.fileName)) === 'effect'

/** What an expression is in effect's Layer module: the module itself, the effect package namespace, or one member of the module. */
type LayerTarget = { readonly kind: 'module' } | { readonly kind: 'index' } | {
  readonly kind: 'member'
  readonly name: string
}

const MODULE: LayerTarget = { kind: 'module' }

/** An import the compiler could not resolve to a file (the package is not installed): the only fact left is the module it names. */
const layerOfUnresolved = (source: { readonly module: string; readonly name: string }): LayerTarget | undefined => {
  if (source.module === 'effect') {
    if (source.name === 'Layer') return MODULE
    return source.name === '*' || source.name === 'default' ? { kind: 'index' } : undefined
  }
  if (source.module === 'effect/Layer') {
    return source.name === '*' || source.name === 'default' ? MODULE : { kind: 'member', name: source.name }
  }
  return undefined
}

const layerOfSymbol = (checker: ts.TypeChecker, symbol: ts.Symbol, depth = 0): LayerTarget | undefined => {
  if (depth > 12) return undefined
  if (symbol.flags & ts.SymbolFlags.Alias) {
    // Follow the alias chain one hop at a time, through renames, namespace re-exports and barrels.
    const next = checker.getImmediateAliasedSymbol(symbol)
    if (next !== undefined && (next.declarations?.length ?? 0) > 0) return layerOfSymbol(checker, next, depth + 1)
    const declaration = symbol.declarations?.[0]
    const source = declaration === undefined ? undefined : aliasSource(declaration)
    return source === undefined ? undefined : layerOfUnresolved(source)
  }
  for (const declaration of symbol.declarations ?? []) {
    const file = declaration.getSourceFile()
    if (!isEffectLayerFile(file)) continue
    if (ts.isSourceFile(declaration)) return MODULE
    if (symbol.flags & ts.SymbolFlags.Value) return { kind: 'member', name: symbol.name }
  }
  return undefined
}

const fromBase = (base: LayerTarget | undefined, name: string): LayerTarget | undefined => {
  if (base?.kind === 'module') return { kind: 'member', name }
  if (base?.kind === 'index' && name === 'Layer') return MODULE
  return undefined
}

/** Where an expression leads in effect's Layer module, following symbols, aliases, destructuring and local re-bindings. */
const layerOfExpr = (checker: ts.TypeChecker, expression: ts.Expression, depth = 0): LayerTarget | undefined => {
  if (depth > 6) return undefined
  const expr = unwrap(expression)
  if (ts.isPropertyAccessExpression(expr)) {
    const symbol = checker.getSymbolAtLocation(expr.name)
    const direct = symbol === undefined ? undefined : layerOfSymbol(checker, symbol)
    return direct ?? fromBase(layerOfExpr(checker, expr.expression, depth + 1), expr.name.text)
  }
  if (!ts.isIdentifier(expr)) return undefined
  const symbol = checker.getSymbolAtLocation(expr)
  if (symbol === undefined) return undefined
  const direct = layerOfSymbol(checker, symbol)
  if (direct !== undefined) return direct
  const declaration = symbol.declarations?.[0]
  if (declaration === undefined) return undefined
  if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && declaration.initializer) {
    return layerOfExpr(checker, declaration.initializer, depth + 1)
  }
  if (ts.isBindingElement(declaration)) return layerOfBinding(checker, declaration, depth + 1)
  return undefined
}

/** What a name destructured from an object leads to: `const { succeed } = Layer`. */
const layerOfBinding = (
  checker: ts.TypeChecker,
  element: ts.BindingElement,
  depth: number,
): LayerTarget | undefined => {
  const pattern = element.parent
  const owner = pattern.parent
  if (!ts.isObjectBindingPattern(pattern) || !ts.isVariableDeclaration(owner) || owner.initializer === undefined) {
    return undefined
  }
  if (element.dotDotDotToken !== undefined) return undefined
  const key = element.propertyName ?? element.name
  if (!ts.isIdentifier(key)) return undefined
  return fromBase(layerOfExpr(checker, owner.initializer, depth), key.text)
}

const inTypePosition = (node: ts.Node): boolean => {
  for (let parent = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isTypeNode(parent) && !ts.isTypeQueryNode(parent) && !ts.isExpressionWithTypeArguments(parent)) return true
    if (ts.isStatement(parent) || ts.isExpression(parent)) return false
  }
  return false
}

/** Every value reference to a member of effect's Layer module: a call, a bare reference, a destructured name, an imported member. */
const layerFacts = (checker: ts.TypeChecker, file: ts.SourceFile): readonly LayerFact[] => {
  const found: LayerFact[] = []
  const add = (member: string, node: ts.Node) => found.push({ member, line: lineOf(file, node) })
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && !inTypePosition(node)) {
      const target = layerOfExpr(checker, node)
      if (target?.kind === 'member') add(target.name, node)
    } else if (ts.isBindingElement(node)) {
      const target = layerOfBinding(checker, node, 0)
      if (target?.kind === 'member') add(target.name, node)
    } else if (ts.isIdentifier(node) && isReference(node) && !inTypePosition(node)) {
      const symbol = checker.getSymbolAtLocation(node)
      if (symbol !== undefined && symbol.flags & ts.SymbolFlags.Alias) {
        const target = layerOfSymbol(checker, symbol)
        if (target?.kind === 'member') add(target.name, node)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

/** An identifier that reads a binding, as opposed to declaring or naming one. */
const isReference = (node: ts.Identifier): boolean => {
  const parent = node.parent
  if (
    ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent) || ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) || ts.isNamespaceExport(parent) || ts.isBindingElement(parent) ||
    ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isFunctionDeclaration(parent) ||
    ts.isPropertySignature(parent) || ts.isTypeReferenceNode(parent) || ts.isQualifiedName(parent)
  ) return false
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false
  if (ts.isPropertyAssignment(parent) && parent.name === node) return false
  return true
}

// --------------------------------------------------------------- environment

/** Whether a symbol is declared by Cloudflare's own types: a declaration file of an `@cloudflare/*` package, `namespace Cloudflare`, or a generated runtime-types file that declares that namespace. */
const declaresCloudflareNamespace = new WeakMap<ts.SourceFile, boolean>()
const fileDeclaresCloudflareNamespace = (file: ts.SourceFile): boolean => {
  let declared = declaresCloudflareNamespace.get(file)
  if (declared === undefined) {
    declared = file.statements.some((s) => ts.isModuleDeclaration(s) && s.name.text === 'Cloudflare')
    declaresCloudflareNamespace.set(file, declared)
  }
  return declared
}

const inNamespaceCloudflare = (node: ts.Node): boolean => {
  for (let parent: ts.Node | undefined = node.parent; parent !== undefined; parent = parent.parent) {
    if (ts.isModuleDeclaration(parent) && parent.name.text === 'Cloudflare') return true
  }
  return false
}

const declaredByCloudflare = (symbol: ts.Symbol | undefined): boolean =>
  (symbol?.declarations ?? []).some((d) => {
    const file = d.getSourceFile()
    return (file.isDeclarationFile &&
      (file.fileName.includes('/@cloudflare/') || fileDeclaresCloudflareNamespace(file))) ||
      inNamespaceCloudflare(d)
  })

/** The binding classes of Cloudflare's runtime types. Only a symbol Cloudflare's own types declare counts, so a library's own `KVNamespace` does not. */
const BINDING_CLASSES = new Set([
  'KVNamespace',
  'D1Database',
  'R2Bucket',
  'DurableObjectNamespace',
  'Hyperdrive',
  'VectorizeIndex',
  'AnalyticsEngineDataset',
  'Fetcher',
  'Queue',
  'Ai',
])

/** Whether the compiler resolves this type to Cloudflare's `Env` (or an interface extending it), or to an object with one of Cloudflare's binding classes as a property. A type the compiler cannot resolve is not an environment: no name decides it. */
const isCloudflareEnv = (checker: ts.TypeChecker, type: ts.Type, depth = 0): boolean => {
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false
  for (const symbol of [type.aliasSymbol, type.getSymbol()]) {
    if (symbol === undefined) continue
    if (symbol.name === 'Env' && (symbol.declarations ?? []).some((d) => inNamespaceCloudflare(d))) return true
  }
  if (depth < 3) {
    const base = type.getSymbol() !== undefined && type.isClassOrInterface() ? checker.getBaseTypes(type) : []
    const inner = [...base, ...(type.isUnionOrIntersection() ? type.types : []), ...(type.aliasTypeArguments ?? [])]
    if (inner.some((t) => isCloudflareEnv(checker, t, depth + 1))) return true
  }
  if (type.flags & ts.TypeFlags.Object) {
    for (const property of checker.getPropertiesOfType(type).slice(0, 120)) {
      const bound = checker.getTypeOfSymbol(property).getSymbol()
      if (bound !== undefined && BINDING_CLASSES.has(bound.name) && declaredByCloudflare(bound)) return true
    }
  }
  return false
}

/** Whether an identifier is the global named `name` (or an alias of it): `process`, `globalThis.process`, `const p = process`, `import * as p from 'node:process'`. */
const isGlobalObject = (checker: ts.TypeChecker, expression: ts.Expression, name: string, depth = 0): boolean => {
  const expr = unwrap(expression)
  if (
    ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'globalThis'
  ) {
    return expr.name.text === name
  }
  if (!ts.isIdentifier(expr) || depth > 4) return false
  const declarations = checker.getSymbolAtLocation(expr)?.declarations
  if (declarations === undefined || declarations.every((d) => d.getSourceFile().isDeclarationFile)) {
    return expr.text === name
  }
  const declaration = declarations[0]!
  const source = aliasSource(declaration)
  if (source !== undefined) {
    return name === 'process' && (source.module === 'node:process' || source.module === 'process') &&
      (source.name === '*' || source.name === 'default')
  }
  if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name) && declaration.initializer) {
    return isGlobalObject(checker, declaration.initializer, name, depth + 1)
  }
  return false
}

const envFacts = (checker: ts.TypeChecker, file: ts.SourceFile): readonly EnvFact[] => {
  const found: EnvFact[] = []
  const add = (kind: EnvFact['kind'], node: ts.Node) => found.push({ kind, line: lineOf(file, node) })
  const ambientEnv = (target: ts.Expression): EnvFact['kind'] | undefined => {
    const expr = unwrap(target)
    if (isGlobalObject(checker, expr, 'process')) return 'process.env'
    if (isGlobalObject(checker, expr, 'Deno')) return 'Deno.env'
    if (ts.isMetaProperty(expr) && expr.keywordToken === ts.SyntaxKind.ImportKeyword && expr.name.text === 'meta') {
      return 'import.meta.env'
    }
    return undefined
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const named = node.importClause?.namedBindings
      const module = node.moduleSpecifier.text
      if (
        node.importClause?.isTypeOnly !== true && named !== undefined && ts.isNamedImports(named) &&
        named.elements.some((e) => !e.isTypeOnly && (e.propertyName ?? e.name).text === 'env')
      ) {
        if (module === 'cloudflare:workers') add('cloudflare-env', node)
        else if (module === 'node:process' || module === 'process') add('process.env', node)
      }
    } else if (ts.isPropertyAccessExpression(node)) {
      if (node.name.text === 'env') {
        const kind = ambientEnv(node.expression)
        if (kind !== undefined) add(kind, node)
        else if (isCloudflareEnv(checker, checker.getTypeAtLocation(node))) add('cloudflare-env', node)
      }
    } else if (
      ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) &&
      node.argumentExpression.text === 'env'
    ) {
      const kind = ambientEnv(node.expression)
      if (kind !== undefined) add(kind, node)
    } else if (
      ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer !== undefined
    ) {
      const kind = ambientEnv(node.initializer)
      if (kind !== undefined && node.name.elements.some((e) => (e.propertyName ?? e.name).getText(file) === 'env')) {
        add(kind, node)
      }
    } else if (ts.isParameter(node)) {
      if (isCloudflareEnv(checker, checker.getTypeAtLocation(node))) add('cloudflare-env', node)
      else if (ts.isObjectBindingPattern(node.name)) {
        for (const element of node.name.elements) {
          if (isCloudflareEnv(checker, checker.getTypeAtLocation(element))) add('cloudflare-env', element)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

// ---------------------------------------------------------------- workspace

const workspaceTarget = (
  byName: ReadonlyMap<string, Unit | Pending>,
  specifier: string,
): { readonly unit: Unit | Pending; readonly subpath: string } | undefined => {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return undefined
  const parts = specifier.split('/')
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
  const unit = byName.get(name)
  if (unit === undefined) return undefined
  const rest = specifier.slice(name.length)
  return { unit, subpath: rest === '' ? '.' : `.${rest}` }
}

interface Pending {
  readonly dir: string
  readonly name: string
  readonly manifest: Json
}

/** Specifiers no package install provides: a Node builtin, a runtime-provided module, a Deno or Bun scheme. */
const isExternalByDesign = (specifier: string): boolean =>
  isBuiltin(specifier) || specifier.includes(':') || specifier === 'bun'

const within = (dir: string, path: string): boolean => path === dir || path.startsWith(dir + '/')

export const loadWorkspace = async (root: string): Promise<Workspace> => {
  const dirs = await workspacePackageDirs(root, await readWorkspace(root))
  const pending: Pending[] = []
  for (const dir of dirs) {
    const manifest = parseJsonObject(await Deno.readTextFile(join(dir, 'package.json')), join(dir, 'package.json'))
    pending.push({ dir, manifest, name: typeof manifest['name'] === 'string' ? manifest['name'] : relative(root, dir) })
  }
  const byPendingName = new Map<string, Pending>(pending.map((p) => [p.name, p]))
  const units: Unit[] = []
  for (const p of pending) {
    const found: Found = { sources: [], declarations: [], tsconfigs: [], bundlerConfigs: [] }
    await walk(p.dir, true, found, new Set(pending.map((u) => u.dir).filter((d) => d !== p.dir)))
    const compiler = compilerOf(found.tsconfigs, p.dir)
    const conditions = new Set([...compiler.conditions, ...DEFAULT_CONDITIONS])
    const program = ts.createProgram({
      rootNames: [...found.sources, ...found.declarations],
      options: {
        ...compiler.options,
        noEmit: true,
        skipLibCheck: true,
        noLib: true,
        composite: false,
        incremental: false,
        allowJs: false,
      },
    })
    const checker = program.getTypeChecker()
    const hasPaths = compiler.pathAliases.length > 0 || compiler.options.baseUrl !== undefined
    const unresolved = new Set<string>()
    const resolutionCache = ts.createModuleResolutionCache(p.dir, (name) => name, compiler.options)
    const files: SourceFile[] = []
    for (const path of found.sources.sort()) {
      const source = program.getSourceFile(path)
      if (source === undefined) continue
      const rel = relative(p.dir, path)
      const imports = rawImports(source).map((raw): ImportFact => {
        const target = workspaceTarget(byPendingName, raw.specifier)
        if (target !== undefined) {
          const resolution = resolveExports(target.unit.manifest, target.subpath, conditions)
          const unrestricted = exportsMapOf(target.unit.manifest) === undefined
          return {
            ...raw,
            workspace: {
              unit: target.unit.name,
              subpath: target.subpath,
              key: resolution?.key,
              exported: unrestricted || (resolution !== undefined && resolution.target !== null),
            },
          }
        }
        const bare = !raw.specifier.startsWith('.') && !raw.specifier.startsWith('/')
        if (bare && !hasPaths) {
          if (!isExternalByDesign(raw.specifier) && !unresolved.has(raw.specifier)) {
            const resolution = ts.resolveModuleName(raw.specifier, path, compiler.options, ts.sys, resolutionCache)
            if (resolution.resolvedModule === undefined) unresolved.add(raw.specifier)
          }
          return raw
        }
        const resolved = ts.resolveModuleName(raw.specifier, path, compiler.options, ts.sys).resolvedModule
          ?.resolvedFileName
        if (resolved === undefined) {
          if (bare && !isExternalByDesign(raw.specifier)) unresolved.add(raw.specifier)
          return raw
        }
        const owner = resolved.includes('/node_modules/')
          ? undefined
          : pending.filter((u) => within(u.dir, resolved)).sort((a, b) => b.dir.length - a.dir.length)[0]
        const into = owner !== undefined && owner.name !== p.name ? owner : undefined
        return { ...raw, resolvedFile: resolved, ...(into === undefined ? {} : { intoUnit: into.name }) }
      })
      files.push({
        path,
        rel,
        isTest: isTestPath(rel),
        isToolConfig: isToolConfigPath(rel),
        imports,
        env: envFacts(checker, source),
        layers: layerFacts(checker, source),
      })
    }
    const bundlerAliases: PathAlias[] = []
    for (const config of found.bundlerConfigs) bundlerAliases.push(...await bundlerAliasesOf(config, p.dir))
    const kind = p.manifest['unit']
    const deployConfigs: string[] = []
    for await (const entry of Deno.readDir(p.dir)) {
      if (entry.isFile && (entry.name.split('.')[0] === 'wrangler' || entry.name.startsWith('Dockerfile'))) {
        deployConfigs.push(entry.name)
      }
    }
    units.push({
      dir: p.dir,
      rel: relative(root, p.dir) || '.',
      name: p.name,
      manifest: p.manifest,
      kind: typeof kind === 'string' && KINDS.includes(kind) ? (kind as Kind) : undefined,
      files,
      pathAliases: compiler.pathAliases,
      bundlerAliases,
      conditions: [...conditions],
      hasInternalFolder: await exists(join(p.dir, 'src', 'internal')) || await exists(join(p.dir, 'internal')),
      unresolved: [...unresolved].sort(),
      deployConfigs: deployConfigs.sort(),
    })
  }
  return { root, units, byName: new Map(units.map((u) => [u.name, u])) }
}

// ------------------------------------------------------------------ queries

export const sourcesOf = (unit: Unit): readonly SourceFile[] => unit.files.filter((f) => !f.isTest)

/** A unit that has not declared its kind yet is judged as a library; composition-unit-kinds reports the missing kind. */
export const judgedAsLibrary = (unit: Unit): boolean => unit.kind === undefined || unit.kind === 'library'

/** Names a manifest declares; by default every field, devDependencies included. */
export const declaredDependencies = (
  unit: Unit,
  fields: readonly string[] = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'],
): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const field of fields) {
    const deps = unit.manifest[field]
    if (typeof deps === 'object' && deps !== null) { for (const name of Object.keys(deps)) names.add(name) }
  }
  return names
}

/** Workspace packages a unit's files (tests included) import, other than itself. */
export const importedUnits = (unit: Unit): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const file of unit.files) {
    for (const i of file.imports) {
      if (i.workspace !== undefined && i.workspace.unit !== unit.name) names.add(i.workspace.unit)
    }
  }
  return names
}

/** A module that binds code to one runtime or framework: a Node builtin, a cloudflare: module, or a framework package. */
export const isRuntimeModule = (specifier: string): boolean => {
  if (isBuiltin(specifier) || specifier.startsWith('cloudflare:') || specifier.startsWith('@cloudflare/')) return true
  const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!
  return RUNTIME_PACKAGES.has(name)
}

export { exportsMapOf, isBuildOutput, targetsOf }
export type { Json }
