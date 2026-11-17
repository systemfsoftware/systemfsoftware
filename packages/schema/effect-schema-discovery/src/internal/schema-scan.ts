import type { Expression, MemberExpression, TSType, TSTypeName } from '@oxc-project/types'
import type { Stats } from 'node:fs'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { parseSync } from 'oxc-parser'
import { exportsAssignableToSchemaTop, type ExportsOutsideSyntacticPass } from './schema-assignability.js'

/**
 * A schema found by {@link findExportedSchemas}: the module that declares it and the name it
 * is exported under.
 *
 * @since 0.1.0
 */
export interface FoundSchema {
  readonly name: string
  readonly filePath: string
}

interface DeclaredExport {
  readonly name: string
  readonly syntacticallySchema: boolean
}

function findDeclaredExports(source: string): DeclaredExport[] {
  try {
    const result = parseSync('temp.ts', source)

    const exports: DeclaredExport[] = []

    for (const node of result.program.body) {
      if (node.type !== 'ExportNamedDeclaration') continue
      const decl = node.declaration
      if (!decl) continue

      if (decl.type === 'ClassDeclaration') {
        const className = decl.id?.name
        if (typeof className === 'string' && !className.startsWith('_')) {
          exports.push({ name: className, syntacticallySchema: extendsSchemaClass(decl.superClass) })
        }
        continue
      }

      if (decl.type !== 'VariableDeclaration') continue

      for (const declarator of decl.declarations) {
        const id = declarator.id
        if (id.type !== 'Identifier') continue
        const name = id.name
        if (name.startsWith('_')) continue

        let isSchema = false
        if (id.typeAnnotation) {
          isSchema = typeRefContainsSchema(id.typeAnnotation.typeAnnotation)
        }
        if (!isSchema && declarator.init) {
          isSchema = initRefersToSchema(declarator.init)
        }
        exports.push({ name, syntacticallySchema: isSchema })
      }
    }

    return exports
  } catch {
    return []
  }
}

function typeRefContainsSchema(t: TSType | null | undefined): boolean {
  if (!t) return false

  if (t.type === 'TSTypeReference' && typeNameContainsSchema(t.typeName)) {
    return true
  }

  if (t.type === 'TSUnionType' || t.type === 'TSIntersectionType') {
    return t.types.some((member) => typeRefContainsSchema(member))
  }

  return false
}

function typeNameContainsSchema(name: TSTypeName): boolean {
  if (name.type === 'Identifier') {
    return name.name.includes('Schema')
  }
  if (name.type === 'TSQualifiedName') {
    return typeNameContainsSchema(name.left) || typeNameContainsSchema(name.right)
  }
  return false
}

/**
 * Schema members whose return value is NOT a schema: a type guard, a decoder, an encoder,
 * an arbitrary, or a JSON-schema document. A const bound to one of these is a *use* of the
 * schema it names, so generating round-trip laws for it hands `encodeUnknownEffect` a
 * predicate and the generated suite dies at import with `Cannot read properties of
 * undefined (reading 'encoding')`. Measured 2026-08-17 on `S.is` in `stryker-plugins`.
 *
 * Enumerated, never prefix-matched: `Schema.decodeTo` starts with `decode` and *does*
 * produce a schema, so a `/^decode/` test would silently drop a real codec's laws.
 */
const SCHEMA_USE_MEMBERS: Record<string, true> = {
  decode: true,
  decodeEffect: true,
  decodeExit: true,
  decodeOption: true,
  decodePromise: true,
  decodeResult: true,
  decodeSync: true,
  decodeUnknownEffect: true,
  decodeUnknownExit: true,
  decodeUnknownOption: true,
  decodeUnknownPromise: true,
  decodeUnknownResult: true,
  decodeUnknownSync: true,
  encode: true,
  encodeEffect: true,
  encodeExit: true,
  encodeOption: true,
  encodePromise: true,
  encodeResult: true,
  encodeSync: true,
  encodeUnknownEffect: true,
  encodeUnknownExit: true,
  encodeUnknownOption: true,
  encodeUnknownPromise: true,
  encodeUnknownResult: true,
  encodeUnknownSync: true,
  toJsonSchemaDocument: true,
  is: true,
  isSchema: true,
  isSchemaError: true,
  isSchemaAST: true,
}

function isSchemaUseCall(callee: MemberExpression): boolean {
  return callee.property.type === 'Identifier' && SCHEMA_USE_MEMBERS[callee.property.name] === true
}

function initRefersToSchema(expr: Expression | null | undefined): boolean {
  if (!expr) return false

  if (expr.type === 'CallExpression') {
    const callee = expr.callee

    if (callee.type === 'Identifier' && callee.name === 'pipe') {
      return expr.arguments.some((arg) => arg.type !== 'SpreadElement' && initRefersToSchema(arg))
    }

    if (callee.type === 'MemberExpression') return memberChainStartsWithS(callee) && !isSchemaUseCall(callee)
    if (callee.type === 'Identifier') return callee.name.includes('Schema')

    return false
  }

  if (expr.type === 'MemberExpression') return memberChainStartsWithS(expr)

  return false
}

function memberChainStartsWithS(node: MemberExpression): boolean {
  const obj = node.object

  if (obj.type === 'Identifier') return obj.name === 'S' || obj.name.includes('Schema')
  if (obj.type === 'MemberExpression') return memberChainStartsWithS(obj)

  // The chain root can be a call: `Schema.Struct({...}).pipe(...)`, and
  // `S.toJsonSchemaDocument(x).schema` reads a member off a *use* call. Without the guard here
  // the latter is detected as a schema and the generated suite hands a plain JSON-Schema object
  // to `toEncoded`, dying at import with `Cannot read properties of undefined (reading
  // 'encoding')`. Measured 2026-08-17 on `forkCoreSchema` in `stryker-js-mutation-run`.
  if (obj.type === 'CallExpression') {
    const callee = obj.callee
    if (callee.type === 'MemberExpression') return memberChainStartsWithS(callee) && !isSchemaUseCall(callee)
    if (callee.type === 'Identifier') return callee.name === 'S' || callee.name.includes('Schema')
  }

  return false
}

/**
 * True when a class extends `Schema.Class(...)` or `Schema.TaggedClass(...)`.
 * The constructor is curried — `Schema.Class<Foo>()({...})` is two nested
 * CallExpressions wrapping one MemberExpression — so unwrap the call chain
 * before inspecting the member.
 *
 * `Schema.TaggedError` is deliberately excluded: an error is a failure value,
 * not a codec, so it is not subject to the round-trip laws (and its `cause`
 * field is routinely `S.Unknown`, which does not round-trip).
 */
function extendsSchemaClass(superClass: Expression | null | undefined): boolean {
  if (!superClass) return false

  let callee: Expression = superClass
  while (callee.type === 'CallExpression') {
    callee = callee.callee
  }

  if (callee.type !== 'MemberExpression') return false
  if (callee.property.type !== 'Identifier') return false

  const propName = callee.property.name
  if (propName !== 'Class' && propName !== 'TaggedClass') return false

  return memberChainStartsWithS(callee)
}

interface ScannedModule {
  readonly filePath: string
  readonly source: string
  readonly exports: readonly DeclaredExport[]
}

const exportsOutsideSyntacticPass = (module: ScannedModule): ExportsOutsideSyntacticPass => ({
  filePath: module.filePath,
  source: module.source,
  names: module.exports.filter((e) => !e.syntacticallySchema).map((e) => e.name),
})

/**
 * Walk a directory and return every exported const or class that is a schema: one whose type
 * annotation or initializer names `Schema` the way a schema declaration does, or whose type the
 * TypeScript checker finds assignable to `Schema.Top` as resolved from that module. Order is
 * the walk's, then declaration order within a module.
 *
 * @since 0.1.0
 */
export function findExportedSchemas(dir: string): FoundSchema[] {
  const modules = scanModules(dir)
  const assignable = exportsAssignableToSchemaTop(
    modules.map(exportsOutsideSyntacticPass).filter((m) => m.names.length > 0),
  )
  return modules.flatMap((module) =>
    module.exports
      .filter((e) => e.syntacticallySchema || assignable.get(module.filePath)?.has(e.name) === true)
      .map((e) => ({ name: e.name, filePath: module.filePath }))
  )
}

function scanModules(dir: string): ScannedModule[] {
  const modules: ScannedModule[] = []
  const walk = (current: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(current, entry)
      let stat: Stats
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        if (entry === 'node_modules' || entry === '.git') continue
        walk(full)
      } else if (stat.isFile() && extname(entry) === '.ts') {
        let source: string
        try {
          source = readFileSync(full, 'utf-8')
        } catch {
          continue
        }
        modules.push({ filePath: full, source, exports: findDeclaredExports(source) })
      }
    }
  }
  walk(resolve(dir))
  return modules
}
