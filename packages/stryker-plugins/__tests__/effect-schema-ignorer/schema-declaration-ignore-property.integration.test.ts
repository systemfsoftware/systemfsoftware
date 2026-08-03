import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  ANNOTATION_OBJECT_IGNORED,
  ANNOTATION_TEXT_IGNORED,
  decideSchemaDeclarationIgnore,
  SYMBOL_DESCRIPTION_IGNORED,
  TAGGED_FIELDS_IGNORED,
  TAGGED_TAG_IGNORED,
} from '../../src/effect-schema-ignorer/index.js'

import {
  annotationsCall,
  callOf,
  identifier,
  memberOf,
  namedProperty,
  objectOf,
  propertyOf,
} from '../helpers/effect-schema-ast.fixtures.js'

const Feature = makeFeature({ it, layer })

Feature('Effect Schema declarations — invariant coverage as named examples')
  .body(({ scenario }) => {
    scenario(
      'Recognised_SymbolForBrandDescription_IsIgnored',
      Gherkin.Do.pipe(
        Given('`Symbol.for("MyBrand")`')('node', () =>
          Effect.sync(() => {
            const description = { type: 'StringLiteral', value: 'MyBrand' }
            const call = callOf(memberOf('Symbol', 'for'), [description])
            return { description, call }
          })),
        When('decideSchemaDeclarationIgnore examines the description argument')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.description, s.node.call)),
        ),
        Then('it returns SYMBOL_DESCRIPTION_IGNORED')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBe(SYMBOL_DESCRIPTION_IGNORED)
          })
        ),
      ),
    )

    scenario(
      'Recognised_TaggedClassTag_IsIgnored',
      Gherkin.Do.pipe(
        Given('`Schema.TaggedClass("myTag", {})`')('node', () =>
          Effect.sync(() => {
            const tag = { type: 'StringLiteral', value: 'myTag' }
            const fields = { type: 'ObjectExpression' }
            const call = callOf(callOf(memberOf('Schema', 'TaggedClass'), []), [tag, fields])
            return { tag, call }
          })),
        When('decideSchemaDeclarationIgnore examines the tag argument')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.tag, s.node.call)),
        ),
        Then('it returns TAGGED_TAG_IGNORED')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBe(TAGGED_TAG_IGNORED)
          })
        ),
      ),
    )

    scenario(
      'Recognised_TaggedErrorTag_IsIgnored',
      Gherkin.Do.pipe(
        Given('`Schema.TaggedError("err", {})`')('node', () =>
          Effect.sync(() => {
            const tag = { type: 'StringLiteral', value: 'err' }
            const fields = { type: 'ObjectExpression' }
            const call = callOf(callOf(memberOf('Schema', 'TaggedError'), []), [tag, fields])
            return { tag, call }
          })),
        When('decideSchemaDeclarationIgnore examines the tag argument')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.tag, s.node.call)),
        ),
        Then('it returns TAGGED_TAG_IGNORED')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBe(TAGGED_TAG_IGNORED)
          })
        ),
      ),
    )

    scenario(
      'Recognised_TaggedClassFields_AreIgnored',
      Gherkin.Do.pipe(
        Given('`Schema.TaggedClass("myTag", {})`')('node', () =>
          Effect.sync(() => {
            const tag = { type: 'StringLiteral', value: 'myTag' }
            const fields = { type: 'ObjectExpression' }
            const call = callOf(callOf(memberOf('Schema', 'TaggedClass'), []), [tag, fields])
            return { fields, call }
          })),
        When('decideSchemaDeclarationIgnore examines the fields argument')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.fields, s.node.call)),
        ),
        Then('it returns TAGGED_FIELDS_IGNORED')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBe(TAGGED_FIELDS_IGNORED)
          })
        ),
      ),
    )

    scenario(
      'Recognised_TaggedErrorFields_AreIgnored',
      Gherkin.Do.pipe(
        Given('`Schema.TaggedError("err", {})`')('node', () =>
          Effect.sync(() => {
            const tag = { type: 'StringLiteral', value: 'err' }
            const fields = { type: 'ObjectExpression' }
            const call = callOf(callOf(memberOf('Schema', 'TaggedError'), []), [tag, fields])
            return { fields, call }
          })),
        When('decideSchemaDeclarationIgnore examines the fields argument')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.fields, s.node.call)),
        ),
        Then('it returns TAGGED_FIELDS_IGNORED')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBe(TAGGED_FIELDS_IGNORED)
          })
        ),
      ),
    )

    scenario(
      'ExactDiscriminant_SymbolIterator_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`Symbol.iterator("desc")`')('node', () =>
          Effect.sync(() => {
            const description = { type: 'StringLiteral', value: 'desc' }
            const call = callOf(memberOf('Symbol', 'iterator'), [description])
            return { description, call }
          })),
        When('decideSchemaDeclarationIgnore examines the description argument')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.description, s.node.call)),
        ),
        Then('it returns undefined (member name is not `for`)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'ExactDiscriminant_StructFactory_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`Schema.Struct("tag", {})` — non-tagged factory')('node', () =>
          Effect.sync(() => {
            const tag = { type: 'StringLiteral', value: 'tag' }
            const fields = { type: 'ObjectExpression' }
            const call = callOf(callOf(memberOf('Schema', 'Struct'), []), [tag, fields])
            return { tag, fields, call }
          })),
        When('decideSchemaDeclarationIgnore examines the tag and fields arguments')(
          'results',
          (s) =>
            Effect.sync(() => ({
              tag: decideSchemaDeclarationIgnore(s.node.tag, s.node.call),
              fields: decideSchemaDeclarationIgnore(s.node.fields, s.node.call),
            })),
        ),
        Then('both return undefined')((s) =>
          Effect.sync(() => {
            expect(s.results.tag).toBeUndefined()
            expect(s.results.fields).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'PositionLoadBearing_ObjectExpressionAtTagSlot_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`Schema.TaggedClass({}, "tag")` — arguments swapped')('node', () =>
          Effect.sync(() => {
            const tag = { type: 'StringLiteral', value: 'tag' }
            const fields = { type: 'ObjectExpression' }
            const call = callOf(callOf(memberOf('Schema', 'TaggedClass'), []), [fields, tag])
            return { fields, call }
          })),
        When('decideSchemaDeclarationIgnore examines the first argument')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.fields, s.node.call)),
        ),
        Then('it returns undefined (the object expression is at the tag slot, not fields)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'PositionLoadBearing_NonStringAtSymbolForArgument_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`Symbol.for({})` — the argument is an object expression, not a string literal')(
          'node',
          () =>
            Effect.sync(() => {
              const node = { type: 'ObjectExpression' }
              const call = callOf(memberOf('Symbol', 'for'), [node])
              return { node, call }
            }),
        ),
        When('decideSchemaDeclarationIgnore examines the argument')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.node, s.node.call)),
        ),
        Then('it returns undefined (not a string literal)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'PositionLoadBearing_StringBesideSymbolForCall_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('a string literal examined against a Symbol.for call that holds a different string')(
          'node',
          () =>
            Effect.sync(() => {
              const description = { type: 'StringLiteral', value: 'MyBrand' }
              const other = { type: 'StringLiteral', value: 'Other' }
              const call = callOf(memberOf('Symbol', 'for'), [other])
              return { description, call }
            }),
        ),
        When('decideSchemaDeclarationIgnore examines the description string')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.description, s.node.call)),
        ),
        Then('it returns undefined (this string is not the Symbol.for argument)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'BehaviourInput_MatchTagCall_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`Match.tag("a")`')('node', () =>
          Effect.sync(() => {
            const tag = { type: 'StringLiteral', value: 'a' }
            const call = callOf(memberOf('Match', 'tag'), [tag])
            return { tag, call }
          })),
        When('decideSchemaDeclarationIgnore examines the tag argument')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.tag, s.node.call)),
        ),
        Then('it returns undefined (Match.tag is a runtime discriminator, not a declaration)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'BehaviourInput_OrphanNodeWithoutParent_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('an identifier examined without a parent')('node', () =>
          Effect.sync(() => {
            const node = { type: 'Identifier', name: 'x' }
            return { node }
          })),
        When('decideSchemaDeclarationIgnore runs with parent=undefined')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.node, undefined)),
        ),
        Then('it returns undefined (no parent context means no decision)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'BehaviourInput_ArbitraryNodeAndParent_ReturnsKnownReasonsOrUndefined',
      Gherkin.Do.pipe(
        Given('a representative `Symbol.for("MyBrand")` call')('node', () =>
          Effect.sync(() => {
            const node = { type: 'StringLiteral', value: 'MyBrand' }
            const parent = callOf(memberOf('Symbol', 'for'), [node])
            return { node, parent }
          })),
        When('decideSchemaDeclarationIgnore examines the description argument')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.node, s.node.parent)),
        ),
        Then('it returns SYMBOL_DESCRIPTION_IGNORED or undefined — never an arbitrary new reason')((s) =>
          Effect.sync(() => {
            expect(
              s.reason === undefined || s.reason === SYMBOL_DESCRIPTION_IGNORED ||
                s.reason === TAGGED_TAG_IGNORED || s.reason === TAGGED_FIELDS_IGNORED,
            ).toBe(true)
          })
        ),
      ),
    )

    scenario(
      'DocumentationObject_IdentifierKey_IsIgnored',
      Gherkin.Do.pipe(
        Given('`S.annotations({ identifier: "HexBytes" })`')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              namedProperty('identifier', { type: 'StringLiteral', value: 'HexBytes' }),
            ])
            const call = annotationsCall(object)
            return { object, call }
          })),
        When('decideSchemaDeclarationIgnore examines the object and the value')('reasons', (s) =>
          Effect.sync(() => {
            const objectReason = decideSchemaDeclarationIgnore(s.node.object, s.node.call)
            const value = s.node.object.properties[0]
            const valueReason = decideSchemaDeclarationIgnore(value?.value, value, s.node.object, s.node.call)
            return { objectReason, valueReason }
          })),
        Then('the object is ignored and the value is ignored')((s) =>
          Effect.sync(() => {
            expect(s.reasons.objectReason).toBe(ANNOTATION_OBJECT_IGNORED)
            expect(s.reasons.valueReason).toBe(ANNOTATION_TEXT_IGNORED)
          })
        ),
      ),
    )

    scenario(
      'DocumentationObject_QuotedStringLiteralKey_IsIgnored',
      Gherkin.Do.pipe(
        Given('`S.annotations({ "identifier": "HexBytes" })`')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              propertyOf({ type: 'StringLiteral', value: 'identifier' }, { type: 'StringLiteral', value: 'HexBytes' }),
            ])
            const call = annotationsCall(object)
            return { object, call }
          })),
        When('decideSchemaDeclarationIgnore examines the object')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.object, s.node.call)),
        ),
        Then('it returns ANNOTATION_OBJECT_IGNORED')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBe(ANNOTATION_OBJECT_IGNORED)
          })
        ),
      ),
    )

    scenario(
      'DocumentationObject_DocumentationBesideBehaviour_KeepsObjectMutated',
      Gherkin.Do.pipe(
        Given('`S.annotations({ description: "x", arbitrary: () => ... })`')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              namedProperty('description', { type: 'StringLiteral', value: 'x' }),
              namedProperty('arbitrary', { type: 'ArrowFunctionExpression' }),
            ])
            const call = annotationsCall(object)
            return { object, call }
          })),
        When('decideSchemaDeclarationIgnore examines the object and the description value')(
          'reasons',
          (s) => {
            const objectReason = decideSchemaDeclarationIgnore(s.node.object, s.node.call)
            const descriptionProperty = s.node.object.properties[0]
            const valueReason = decideSchemaDeclarationIgnore(
              descriptionProperty?.value,
              descriptionProperty,
              s.node.object,
              s.node.call,
            )
            return Effect.sync(() => ({ objectReason, valueReason }))
          },
        ),
        Then('the object is NOT ignored but the documentation value is ignored')((s) =>
          Effect.sync(() => {
            expect(s.reasons.objectReason).toBeUndefined()
            expect(s.reasons.valueReason).toBe(ANNOTATION_TEXT_IGNORED)
          })
        ),
      ),
    )

    scenario(
      'DocumentationObject_OnlyBehaviourValue_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`S.annotations({ arbitrary: () => ... })`')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              namedProperty('arbitrary', { type: 'ArrowFunctionExpression' }),
            ])
            const call = annotationsCall(object)
            return { object, call }
          })),
        When('decideSchemaDeclarationIgnore examines the value')('reason', (s) =>
          Effect.sync(() => {
            const property = s.node.object.properties[0]
            return decideSchemaDeclarationIgnore(property?.value, property, s.node.object, s.node.call)
          })),
        Then('it returns undefined (behaviour values are never ignored)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'DocumentationObject_BehaviourKeyAlone_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`S.annotations({ arbitrary: () => ... })`')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              namedProperty('arbitrary', { type: 'ArrowFunctionExpression' }),
            ])
            const call = annotationsCall(object)
            return { object, call }
          })),
        When('decideSchemaDeclarationIgnore examines the object')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.object, s.node.call)),
        ),
        Then('it returns undefined (the object holds behaviour, not documentation)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'DocumentationObject_ComputedDocumentationKey_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`S.annotations({ [key]: "x" })`')('node', () =>
          Effect.sync(() => {
            const key = identifier('identifier')
            const value = { type: 'StringLiteral', value: 'x' }
            const object = objectOf([propertyOf(key, value, true)])
            const call = annotationsCall(object)
            return { object, call }
          })),
        When('decideSchemaDeclarationIgnore examines the object and the value')('reasons', (s) =>
          Effect.sync(() => {
            const objectReason = decideSchemaDeclarationIgnore(s.node.object, s.node.call)
            const property = s.node.object.properties[0]
            const valueReason = decideSchemaDeclarationIgnore(property?.value, property, s.node.object, s.node.call)
            return { objectReason, valueReason }
          })),
        Then('neither the object nor the value is ignored (the documentation key is not a string literal)')((s) =>
          Effect.sync(() => {
            expect(s.reasons.objectReason).toBeUndefined()
            expect(s.reasons.valueReason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'AnnotationsCall_DocumentationObjectOutsideAnnotationsCall_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`S.filter({ identifier: "x" })`')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              namedProperty('identifier', { type: 'StringLiteral', value: 'x' }),
            ])
            const call = callOf(memberOf('S', 'filter'), [object])
            return { object, call }
          })),
        When('decideSchemaDeclarationIgnore examines the argument')(
          'reason',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.object, s.node.call)),
        ),
        Then('it returns undefined (the callee is `S.filter`, not `S.annotations`)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'AnnotationsCall_PropertyKeyItself_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`S.annotations({ identifier: "HexBytes" })` — examining the key node')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              namedProperty('identifier', { type: 'StringLiteral', value: 'HexBytes' }),
            ])
            const call = annotationsCall(object)
            return { object, call }
          })),
        When('decideSchemaDeclarationIgnore examines the property key')('reason', (s) =>
          Effect.sync(() => {
            const property = s.node.object.properties[0]
            return decideSchemaDeclarationIgnore(property?.key, property, s.node.object, s.node.call)
          })),
        Then('it returns undefined (the key slot is not the documentation value slot)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'AnnotationsCall_DocumentationValueAtNonAnnotationsCall_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`S.filter({ identifier: "x" })` — the value sits at a non-annotations call')(
          'node',
          () =>
            Effect.sync(() => {
              const object = objectOf([
                namedProperty('identifier', { type: 'StringLiteral', value: 'x' }),
              ])
              const call = callOf(memberOf('S', 'filter'), [object])
              return { object, call }
            }),
        ),
        When('decideSchemaDeclarationIgnore examines the value')('reason', (s) =>
          Effect.sync(() => {
            const property = s.node.object.properties[0]
            return decideSchemaDeclarationIgnore(property?.value, property, s.node.object, s.node.call)
          })),
        Then('it returns undefined (no annotations call owns the slot)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'AnnotationsCall_DocumentationValueWithoutItsCall_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('a documentation value examined without passing the annotations call expression')(
          'node',
          () =>
            Effect.sync(() => {
              const object = objectOf([
                namedProperty('identifier', { type: 'StringLiteral', value: 'x' }),
              ])
              return { object }
            }),
        ),
        When('decideSchemaDeclarationIgnore examines the value with ancestor=undefined')(
          'reason',
          (s) =>
            Effect.sync(() => {
              const property = s.node.object.properties[0]
              return decideSchemaDeclarationIgnore(property?.value, property, s.node.object, undefined)
            }),
        ),
        Then('it returns undefined (no call expression in scope means no annotations rule applies)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'AnnotationsCall_DocumentationObjectAtSecondArgument_IsNotIgnored',
      Gherkin.Do.pipe(
        Given('`S.annotations("other", { identifier: "x" })` — documentation object at argument index 1')(
          'node',
          () =>
            Effect.sync(() => {
              const object = objectOf([
                namedProperty('identifier', { type: 'StringLiteral', value: 'x' }),
              ])
              const value = { type: 'StringLiteral', value: 'other' }
              const call = callOf(memberOf('S', 'annotations'), [value, object])
              return { object, call }
            }),
        ),
        When('decideSchemaDeclarationIgnore examines the value at index 1')('reason', (s) =>
          Effect.sync(() => {
            const property = s.node.object.properties[0]
            return decideSchemaDeclarationIgnore(property?.value, property, s.node.object, s.node.call)
          })),
        Then('it returns undefined (the annotations rule only fires at argument index 0)')((s) =>
          Effect.sync(() => {
            expect(s.reason).toBeUndefined()
          })
        ),
      ),
    )
  })
