import type { Expression, MemberExpression, TSType } from '@oxc-project/types'
import { parseSync } from 'oxc-parser'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * @internal
 */
export function findExportedSchemaNames(source: string): string[] {
  try {
    const result = parseSync('temp.ts', source)

    const names: string[] = []

    for (const node of result.program.body) {
      if (node.type !== 'ExportNamedDeclaration') continue
      const decl = node.declaration
      if (!decl) continue

      if (decl.type === 'ClassDeclaration') {
        const className = decl.id?.name
        if (
          typeof className === 'string' && !className.startsWith('_') &&
          extendsSchemaClass(decl.superClass)
        ) {
          names.push(className)
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

        // Check 1: type annotation contains "Schema"
        if (id.typeAnnotation?.typeAnnotation) {
          isSchema = typeRefContainsSchema(id.typeAnnotation.typeAnnotation)
        }

        // Check 2: init is a pipe() call or S. member chain
        if (!isSchema && declarator.init) {
          isSchema = initRefersToSchema(declarator.init)
        }

        if (isSchema) names.push(name)
      }
    }

    return names
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

function typeNameContainsSchema(name: unknown): boolean {
  if (!isRecord(name)) return false
  if (name['type'] === 'Identifier' && typeof name['name'] === 'string') {
    return name['name'].includes('Schema')
  }
  if (name['type'] === 'TSQualifiedName') {
    return typeNameContainsSchema(name['left']) || typeNameContainsSchema(name['right'])
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
  toArbitrary: true,
  toJsonSchemaDocument: true,
  is: true,
  isSchema: true,
  isSchemaError: true,
  isSchemaAST: true,
}

/** True when the member call produces a non-schema value, e.g. `S.is(X)` or `S.encodeSync(X)`. */
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

  // `Schema.Struct({...}).pipe(...)` — the chain root is a call, not a member.
  // The use-call guard has to apply here too, not only where the init IS the
  // call: `S.toJsonSchemaDocument(x).schema` reads a member off a use call, so
  // without this test it is detected as a schema and the generated suite hands
  // a plain JSON-Schema object to `toEncoded`, dying at import with
  // `Cannot read properties of undefined (reading 'encoding')`.
  // Measured 2026-08-17 on `forkCoreSchema` in `stryker-js-mutation-run`.
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
