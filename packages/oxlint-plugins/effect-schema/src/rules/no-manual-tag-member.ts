import { defineRule } from '@oxlint/plugins'
import type { Context, ESTree } from '@oxlint/plugins'
import { Schema as S } from 'effect'
import {
  ACTUAL_TXT,
  ANONYMOUS_NAME,
  ERROR_FIELDS,
  EXPECTED_DERIVATION,
  EXPECTED_TAGGED_ERROR,
  EXPECTED_TAGGED_STRUCT,
  FIX_DERIVATION,
  FIX_TAGGED_ERROR,
  FIX_TAGGED_STRUCT,
  meta,
  NAME_SUFFIX,
  Options,
  type OptionsType,
  TAG_NAME,
} from './no-manual-tag-member.config.js'

export type MessageIds = 'forbidden'

type Prescription = 'taggedStruct' | 'taggedError' | 'derivation'

type EnclosingDeclaration = {
  readonly kind: 'type' | 'interface'
  readonly name: string | null
  readonly typeParams: ReadonlySet<string>
}

const keyValueOf = (key: ESTree.Node): string | null => {
  if (key.type === 'Identifier') return key.name
  return key.type === 'Literal' && typeof key.value === 'string' ? key.value : null
}

const isTagPropertyKey = (node: ESTree.Node): boolean => keyValueOf(node) === TAG_NAME

const isTagPropertySignature = (member: ESTree.TSSignature): boolean =>
  member.type === 'TSPropertySignature' && !member.computed && isTagPropertyKey(member.key)

const propertyNameOf = (member: ESTree.TSPropertySignature): string | null => {
  if (member.computed) return null
  return keyValueOf(member.key)
}

const tagValueOf = (annotation: ESTree.TSTypeAnnotation): string | null => {
  const declared = annotation.typeAnnotation
  if (declared.type !== 'TSLiteralType') return null
  const literal = declared.literal
  if (literal.type !== 'Literal') return null
  return typeof literal.value === 'string' ? literal.value : null
}

const isNode = (value: unknown): value is ESTree.Node => typeof Reflect.get(Object(value), 'type') === 'string'

const SKIPPED_KEYS = new Set(['parent'])

const referencesTypeParam = (node: ESTree.Node, params: ReadonlySet<string>): boolean => {
  if (node.type === 'TSTypeReference' && node.typeName.type === 'Identifier' && params.has(node.typeName.name)) {
    return true
  }
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) continue
    if (isNode(value)) {
      if (referencesTypeParam(value, params)) return true
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item) && referencesTypeParam(item, params)) return true
      }
    }
  }
  return false
}

const typeParamNames = (declaration: ESTree.TSTypeParameterDeclaration | null | undefined): ReadonlySet<string> => {
  const names = new Set<string>()
  if (declaration === null || declaration === undefined) return names
  for (const param of declaration.params) {
    names.add(param.name.name)
  }
  return names
}

const enclosingDeclarationOf = (node: ESTree.Node): EnclosingDeclaration | null => {
  let current: ESTree.Node | null = node.parent
  while (current !== null) {
    if (current.type === 'TSTypeAliasDeclaration') {
      return { kind: 'type', name: current.id.name, typeParams: typeParamNames(current.typeParameters) }
    }
    if (current.type === 'TSInterfaceDeclaration') {
      return { kind: 'interface', name: current.id.name, typeParams: typeParamNames(current.typeParameters) }
    }
    current = current.parent
  }
  return null
}

const taggedLiteralCount = (union: ESTree.TSUnionType): number =>
  union.types.reduce(
    (count, member) => count + (member.type === 'TSTypeLiteral' && member.members.some(isTagPropertySignature) ? 1 : 0),
    0,
  )

const unionMember = (literal: ESTree.TSTypeLiteral): ESTree.TSUnionType | null => {
  const parent = literal.parent
  return parent.type === 'TSUnionType' ? parent : null
}

const prescriptionFor = (
  members: readonly ESTree.TSSignature[],
  typeParams: ReadonlySet<string>,
): Prescription => {
  const fields = members
    .filter((member): member is ESTree.TSPropertySignature => member.type === 'TSPropertySignature')
    .filter((member) => !isTagPropertySignature(member))
  if (
    fields.length > 0 &&
    fields.every((field) => {
      const fieldName = propertyNameOf(field)
      return fieldName !== null && ERROR_FIELDS.includes(fieldName)
    })
  ) {
    return 'taggedError'
  }
  if (fields.some((field) => field.typeAnnotation !== null && referencesTypeParam(field.typeAnnotation, typeParams))) {
    return 'derivation'
  }
  return 'taggedStruct'
}

const prescriptionText = (
  prescription: Prescription,
  name: string,
  tag: string,
): { expected: string; fix: string } => {
  const named = name === ANONYMOUS_NAME ? '<Name>' : name
  if (prescription === 'taggedError') {
    return {
      expected: EXPECTED_TAGGED_ERROR.replaceAll('<Tag>', tag),
      fix: FIX_TAGGED_ERROR.replaceAll('<Tag>', tag),
    }
  }
  if (prescription === 'derivation') {
    return {
      expected: EXPECTED_DERIVATION.replaceAll('<Name>', named),
      fix: FIX_DERIVATION.replaceAll('<Name>', named),
    }
  }
  return {
    expected: EXPECTED_TAGGED_STRUCT.replaceAll('<Name>', named),
    fix: FIX_TAGGED_STRUCT.replaceAll('<Name>', named).replaceAll('<Tag>', tag),
  }
}

export const noManualTagMember = defineRule({
  meta,
  create(context: Context) {
    const options: OptionsType = S.decodeUnknownSync(Options)(context.options[0] ?? {})
    const allow = new Set(options.allow.map((s) => s.toLowerCase()))

    // Scope: `.shape.ts` files are wire-format declarations, and `.tst.ts` files are
    // type-test fixtures that must contain no runtime values — a `S.TaggedStruct`
    // prescription would demand a runtime schema in a file whose job is to hold none.
    // The boundary is a property of what these files *are*, not of any one package.
    if (context.filename.endsWith('.shape.ts') || context.filename.endsWith('.tst.ts')) return {}

    const reportTag = (
      tag: ESTree.TSPropertySignature,
      members: readonly ESTree.TSSignature[],
      enclosing: EnclosingDeclaration | null,
    ) => {
      const annotation = tag.typeAnnotation
      if (annotation === null) return
      const tagValue = tagValueOf(annotation)
      if (tagValue === null) return
      if (allow.has(tagValue.toLowerCase())) return
      const rawName = enclosing?.name ?? ANONYMOUS_NAME
      const name = enclosing === null ? ANONYMOUS_NAME : `${enclosing.kind} ${enclosing.name} ${NAME_SUFFIX}`
      const { expected, fix } = prescriptionText(
        prescriptionFor(members, enclosing?.typeParams ?? new Set()),
        rawName,
        tagValue,
      )
      context.report({
        node: tag.key,
        messageId: 'forbidden',
        data: {
          name,
          expected,
          actual: ACTUAL_TXT,
          fix,
        },
      })
    }

    return {
      TSTypeLiteral(node: ESTree.TSTypeLiteral) {
        const union = unionMember(node)
        if (union === null) return
        if (taggedLiteralCount(union) < 2) return
        const enclosing = enclosingDeclarationOf(node)
        for (const member of node.members) {
          if (member.type !== 'TSPropertySignature' || !isTagPropertySignature(member)) continue
          reportTag(member, node.members, enclosing)
        }
      },
      TSInterfaceBody(node: ESTree.TSInterfaceBody) {
        const enclosing = enclosingDeclarationOf(node)
        for (const member of node.body) {
          if (member.type !== 'TSPropertySignature' || !isTagPropertySignature(member)) continue
          reportTag(member, node.body, enclosing)
        }
      },
    }
  },
})
