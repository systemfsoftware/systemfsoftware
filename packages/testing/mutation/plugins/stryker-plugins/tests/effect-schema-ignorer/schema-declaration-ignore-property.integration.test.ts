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
} from '@systemfsoftware/stryker-plugins/effect-schema-ignorer'

import {
  annotationsCall,
  callOf,
  identifier,
  memberOf,
  namedProperty,
  objectExpression,
  objectOf,
  propertyOf,
  stringLiteral,
  symbolForCall,
  taggedCall,
} from '../__fixtures__/EffectSchemaAst.fixtures.js'

const Feature = makeFeature({ it, layer })

Feature('Effect Schema declarations — invariant coverage as named examples')
  .body(({ scenario }) => {
    scenario(
      'A `Symbol.for` description string is recognised as ignorable',
      Gherkin.Do.pipe(
        Given('`Symbol.for("MyBrand")`')('node', () =>
          Effect.sync(() => {
            const description = stringLiteral('MyBrand')
            const call = symbolForCall(description)
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
      'A `Schema.TaggedClass` tag string is recognised as ignorable',
      Gherkin.Do.pipe(
        Given('`Schema.TaggedClass("myTag", {})`')('node', () =>
          Effect.sync(() => {
            const tag = stringLiteral('myTag')
            const fields = objectExpression()
            const call = taggedCall('TaggedClass', tag, fields)
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
      'A `Schema.TaggedError` tag string is recognised as ignorable',
      Gherkin.Do.pipe(
        Given('`Schema.TaggedError("err", {})`')('node', () =>
          Effect.sync(() => {
            const tag = stringLiteral('err')
            const fields = objectExpression()
            const call = taggedCall('TaggedError', tag, fields)
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
      'A `Schema.TaggedClass` fields object is recognised as ignorable',
      Gherkin.Do.pipe(
        Given('`Schema.TaggedClass("myTag", {})`')('node', () =>
          Effect.sync(() => {
            const tag = stringLiteral('myTag')
            const fields = objectExpression()
            const call = taggedCall('TaggedClass', tag, fields)
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
      'A `Schema.TaggedError` fields object is recognised as ignorable',
      Gherkin.Do.pipe(
        Given('`Schema.TaggedError("err", {})`')('node', () =>
          Effect.sync(() => {
            const tag = stringLiteral('err')
            const fields = objectExpression()
            const call = taggedCall('TaggedError', tag, fields)
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
      'A `Symbol.iterator` member is not an exact-discriminant match',
      Gherkin.Do.pipe(
        Given('`Symbol.iterator("desc")`')('node', () =>
          Effect.sync(() => {
            const description = stringLiteral('desc')
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
      'A non-tagged `Schema.Struct` factory is not an exact-discriminant match',
      Gherkin.Do.pipe(
        Given('`Schema.Struct("tag", {})` — non-tagged factory')('node', () =>
          Effect.sync(() => {
            const tag = stringLiteral('tag')
            const fields = objectExpression()
            const call = taggedCall('Struct', tag, fields)
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
      'An object expression at the tag slot is position-load-bearing',
      Gherkin.Do.pipe(
        Given('`Schema.TaggedClass({}, "tag")` — arguments swapped')('node', () =>
          Effect.sync(() => {
            const tag = stringLiteral('tag')
            const fields = objectExpression()
            const call = taggedCall('TaggedClass', fields, tag)
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
      'A non-string at the `Symbol.for` argument slot is position-load-bearing',
      Gherkin.Do.pipe(
        Given('`Symbol.for({})` — the argument is an object expression, not a string literal')(
          'node',
          () =>
            Effect.sync(() => {
              const node = objectExpression()
              const call = symbolForCall(node)
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
      'A string beside a `Symbol.for` call is position-load-bearing',
      Gherkin.Do.pipe(
        Given('a string literal examined against a Symbol.for call that holds a different string')(
          'node',
          () =>
            Effect.sync(() => {
              const description = stringLiteral('MyBrand')
              const other = stringLiteral('Other')
              const call = symbolForCall(other)
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
      'A `Match.tag` call as behaviour input is not ignored',
      Gherkin.Do.pipe(
        Given('`Match.tag("a")`')('node', () =>
          Effect.sync(() => {
            const tag = stringLiteral('a')
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
      'An orphan node without a parent as behaviour input is not ignored',
      Gherkin.Do.pipe(
        Given('an identifier examined without a parent')('node', () =>
          Effect.sync(() => {
            const node = identifier('x')
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
      'An arbitrary node and parent pair returns known reasons or undefined',
      Gherkin.Do.pipe(
        Given('a representative `Symbol.for("MyBrand")` call')('node', () =>
          Effect.sync(() => {
            const node = stringLiteral('MyBrand')
            const parent = symbolForCall(node)
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
      'An identifier key in a documentation object is ignored',
      Gherkin.Do.pipe(
        Given('`S.annotations({ identifier: "HexBytes" })`')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              namedProperty('identifier', stringLiteral('HexBytes')),
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
      'A quoted string-literal key in a documentation object is ignored',
      Gherkin.Do.pipe(
        Given('`S.annotations({ "identifier": "HexBytes" })`')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              propertyOf(stringLiteral('identifier'), stringLiteral('HexBytes')),
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
      'Documentation beside a behaviour key keeps the object mutated',
      Gherkin.Do.pipe(
        Given('`S.annotations({ description: "x", arbitrary: () => ... })`')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              namedProperty('description', stringLiteral('x')),
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
      'An object holding only a behaviour value is not ignored',
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
      'A behaviour key alone in the object is not ignored',
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
      'A computed documentation key is not ignored',
      Gherkin.Do.pipe(
        Given('`S.annotations({ [key]: "x" })`')('node', () =>
          Effect.sync(() => {
            const key = identifier('identifier')
            const value = stringLiteral('x')
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
      'A documentation object outside an annotations call is not ignored',
      Gherkin.Do.pipe(
        Given('`S.filter({ identifier: "x" })`')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              namedProperty('identifier', stringLiteral('x')),
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
      'A property key itself in a non-annotations position is not ignored',
      Gherkin.Do.pipe(
        Given('`S.annotations({ identifier: "HexBytes" })` — examining the key node')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              namedProperty('identifier', stringLiteral('HexBytes')),
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
      'A documentation value at a non-annotations call is not ignored',
      Gherkin.Do.pipe(
        Given('`S.filter({ identifier: "x" })` — the value sits at a non-annotations call')(
          'node',
          () =>
            Effect.sync(() => {
              const object = objectOf([
                namedProperty('identifier', stringLiteral('x')),
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
      'A documentation value without its enclosing call is not ignored',
      Gherkin.Do.pipe(
        Given('a documentation value examined without passing the annotations call expression')(
          'node',
          () =>
            Effect.sync(() => {
              const object = objectOf([
                namedProperty('identifier', stringLiteral('x')),
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
      'A documentation object at the second argument slot is not ignored',
      Gherkin.Do.pipe(
        Given('`S.annotations("other", { identifier: "x" })` — documentation object at argument index 1')(
          'node',
          () =>
            Effect.sync(() => {
              const object = objectOf([
                namedProperty('identifier', stringLiteral('x')),
              ])
              const value = stringLiteral('other')
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
