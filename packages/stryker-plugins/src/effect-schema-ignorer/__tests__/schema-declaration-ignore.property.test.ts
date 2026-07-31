import { describe, it } from '@effect/vitest'
import { Schema as S } from 'effect'
import { ObjectExpression, StringLiteral } from '../ast-node.schema.js'
import {
  ANNOTATION_OBJECT_IGNORED,
  ANNOTATION_TEXT_IGNORED,
  decideSchemaDeclarationIgnore,
  SYMBOL_DESCRIPTION_IGNORED,
  TAGGED_FIELDS_IGNORED,
  TAGGED_TAG_IGNORED,
} from '../schema-declaration-ignore.js'
import {
  annotationsCall,
  behaviourKey,
  callOf,
  documentationKey,
  identifier,
  memberOf,
  namedProperty,
  nonAnnotationsMethod,
  nonSymbolForMember,
  nonTaggedFactory,
  objectOf,
  propertyOf,
  symbolForCall,
  taggedCall,
  taggedFactory,
} from './ast-node.fixtures.js'

describe('decideSchemaDeclarationIgnore — recognised declarations are ignored', () => {
  it.prop(
    '∀d_SymbolForBrandDescription_∈Ignored',
    [StringLiteral],
    ([description]) =>
      decideSchemaDeclarationIgnore(description, symbolForCall(description)) === SYMBOL_DESCRIPTION_IGNORED,
  )

  it.prop(
    '∀c_TaggedClassOrErrorTag_∈Ignored',
    [StringLiteral, ObjectExpression, taggedFactory],
    ([tag, fields, factory]) =>
      decideSchemaDeclarationIgnore(tag, taggedCall(factory, tag, fields)) === TAGGED_TAG_IGNORED,
  )

  it.prop(
    '∀c_TaggedClassOrErrorFields_∈Ignored',
    [StringLiteral, ObjectExpression, taggedFactory],
    ([tag, fields, factory]) =>
      decideSchemaDeclarationIgnore(fields, taggedCall(factory, tag, fields)) === TAGGED_FIELDS_IGNORED,
  )
})

describe('decideSchemaDeclarationIgnore — only the exact discriminant matches', () => {
  it.prop(
    '∀p_MemberNameOtherThanSymbolFor_⊥Ignored',
    [StringLiteral, nonSymbolForMember],
    ([description, [object, property]]) =>
      decideSchemaDeclarationIgnore(description, callOf(memberOf(object, property), [description])) === undefined,
  )

  it.prop(
    '∀f_FactoryNameOtherThanTagged_⊥Ignored',
    [StringLiteral, ObjectExpression, nonTaggedFactory],
    ([tag, fields, factory]) => {
      const call = taggedCall(factory, tag, fields)
      return decideSchemaDeclarationIgnore(tag, call) === undefined &&
        decideSchemaDeclarationIgnore(fields, call) === undefined
    },
  )
})

describe('decideSchemaDeclarationIgnore — position and node-type are load-bearing', () => {
  it.prop(
    '∀c_ObjectAtTagPosition_⊥Ignored',
    [StringLiteral, ObjectExpression, taggedFactory],
    ([tag, fields, factory]) => decideSchemaDeclarationIgnore(fields, taggedCall(factory, fields, tag)) === undefined,
  )

  it.prop(
    '∀c_NonStringAtSymbolForArgument_⊥Ignored',
    [ObjectExpression],
    ([node]) => decideSchemaDeclarationIgnore(node, symbolForCall(node)) === undefined,
  )

  it.prop(
    '∀c_UnreferencedNodeBesideTheArgument_⊥Ignored',
    [StringLiteral, StringLiteral],
    ([description, other]) => decideSchemaDeclarationIgnore(description, symbolForCall(other)) === undefined,
  )
})

describe('decideSchemaDeclarationIgnore — behaviour and unrelated input are never ignored', () => {
  it.prop(
    '∀t_MatchTagDiscriminantString_⊥Ignored',
    [StringLiteral],
    ([tag]) => decideSchemaDeclarationIgnore(tag, callOf(memberOf('Match', 'tag'), [tag])) === undefined,
  )

  it.prop(
    '∀n_AnyNodeWithoutParent_⊥Ignored',
    [S.Unknown],
    ([node]) => decideSchemaDeclarationIgnore(node, undefined) === undefined,
  )

  it.prop('∀n_ArbitraryNodeAndParent_∈KnownReasons', [S.Unknown, S.Unknown], ([node, parent]) => {
    const result = decideSchemaDeclarationIgnore(node, parent)
    return result === undefined ||
      result === SYMBOL_DESCRIPTION_IGNORED ||
      result === TAGGED_TAG_IGNORED ||
      result === TAGGED_FIELDS_IGNORED
  })
})

describe('decideSchemaDeclarationIgnore — documentation-only annotations are ignored', () => {
  it.prop(
    '∀k_EveryDocumentationKey_∈Ignored',
    [documentationKey, StringLiteral],
    ([key, value]) => {
      const object = objectOf([namedProperty(key, value)])
      const call = annotationsCall(object)
      return decideSchemaDeclarationIgnore(object, call) === ANNOTATION_OBJECT_IGNORED &&
        decideSchemaDeclarationIgnore(value, object.properties[0], object, call) === ANNOTATION_TEXT_IGNORED
    },
  )

  it.prop(
    '∀k_QuotedDocumentationKey_∈Ignored',
    [documentationKey, StringLiteral],
    ([key, value]) => {
      const object = objectOf([propertyOf({ type: 'StringLiteral', value: key }, value)])
      return decideSchemaDeclarationIgnore(object, annotationsCall(object)) === ANNOTATION_OBJECT_IGNORED
    },
  )
})

describe('decideSchemaDeclarationIgnore — one behaviour entry keeps the object mutated, not its documentation', () => {
  it.prop(
    '∀k_DocumentationBesideBehaviour_∈IgnoredButObjectIsNot',
    [documentationKey, behaviourKey, StringLiteral],
    ([docKey, behaviour, value]) => {
      const object = objectOf([namedProperty(docKey, value), namedProperty(behaviour, value)])
      const call = annotationsCall(object)
      return decideSchemaDeclarationIgnore(object, call) === undefined &&
        decideSchemaDeclarationIgnore(value, object.properties[0], object, call) === ANNOTATION_TEXT_IGNORED
    },
  )

  it.prop(
    '∀k_BehaviourValue_⊥Ignored',
    [behaviourKey, StringLiteral],
    ([behaviour, value]) => {
      const object = objectOf([namedProperty(behaviour, value)])
      const call = annotationsCall(object)
      return decideSchemaDeclarationIgnore(value, object.properties[0], object, call) === undefined
    },
  )

  it.prop(
    '∀k_BehaviourKeyAlone_⊥Ignored',
    [behaviourKey, StringLiteral],
    ([behaviour, value]) => {
      const object = objectOf([namedProperty(behaviour, value)])
      return decideSchemaDeclarationIgnore(object, annotationsCall(object)) === undefined
    },
  )

  it.prop(
    '∀k_ComputedDocumentationKey_⊥Ignored',
    [documentationKey, StringLiteral],
    ([key, value]) => {
      const object = objectOf([propertyOf(identifier(key), value, true)])
      const call = annotationsCall(object)
      return decideSchemaDeclarationIgnore(object, call) === undefined &&
        decideSchemaDeclarationIgnore(value, object.properties[0], object, call) === undefined
    },
  )
})

describe('decideSchemaDeclarationIgnore — the annotations call and the value slot are load-bearing', () => {
  it.prop(
    '∀k_DocumentationObjectOutsideAnnotations_⊥Ignored',
    [documentationKey, StringLiteral, nonAnnotationsMethod],
    ([key, value, method]) => {
      const object = objectOf([namedProperty(key, value)])
      return decideSchemaDeclarationIgnore(object, callOf(memberOf('S', method), [object])) === undefined
    },
  )

  it.prop(
    '∀k_DocumentationKeyItself_⊥Ignored',
    [documentationKey, StringLiteral],
    ([key, value]) => {
      const object = objectOf([namedProperty(key, value)])
      const call = annotationsCall(object)
      return decideSchemaDeclarationIgnore(object.properties[0]?.key, object.properties[0], object, call) === undefined
    },
  )

  it.prop(
    '∀k_DocumentationValueOutsideAnnotations_⊥Ignored',
    [documentationKey, StringLiteral, nonAnnotationsMethod],
    ([key, value, method]) => {
      const object = objectOf([namedProperty(key, value)])
      const call = callOf(memberOf('S', method), [object])
      return decideSchemaDeclarationIgnore(value, object.properties[0], object, call) === undefined
    },
  )

  it.prop(
    '∀k_DocumentationValueWithoutItsCall_⊥Ignored',
    [documentationKey, StringLiteral],
    ([key, value]) => {
      const object = objectOf([namedProperty(key, value)])
      return decideSchemaDeclarationIgnore(value, object.properties[0], object, undefined) === undefined
    },
  )

  it.prop(
    '∀k_DocumentationObjectAtSecondArgument_⊥Ignored',
    [documentationKey, StringLiteral],
    ([key, value]) => {
      const object = objectOf([namedProperty(key, value)])
      const call = callOf(memberOf('S', 'annotations'), [value, object])
      return decideSchemaDeclarationIgnore(value, object.properties[0], object, call) === undefined
    },
  )
})
