import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Effect } from 'effect'
import { expect } from 'vitest'

import {
  ANNOTATION_OBJECT_IGNORED,
  ANNOTATION_TEXT_IGNORED,
  BRAND_NAME_IGNORED,
  CLASS_ID_IGNORED,
  decideSchemaDeclarationIgnore,
  OPTIONAL_DEFAULT_IGNORED,
} from '@systemfsoftware/stryker-plugins/effect-schema-ignorer'

import {
  annotationsCall,
  bareFactoryCall,
  brandCall,
  callOf,
  classCall,
  memberOf,
  namedProperty,
  objectExpression,
  objectOf,
  stringLiteral,
} from '../__fixtures__/EffectSchemaAst.fixtures.js'

const Feature = makeFeature({ it, layer })

Feature('Effect Schema declarations — ignored mutants on tags, brands, optionals, and annotation objects')
  .body(({ scenario }) => {
    scenario(
      'A bare identifier factory keeps its tagged arguments live',
      Gherkin.Do.pipe(
        Given('a bare `TaggedClass("tag", {})` call expression (no `Schema.` prefix)')('node', () =>
          Effect.sync(() => {
            const tag = stringLiteral('someTag')
            const fields = objectExpression()
            return { tag, fields, call: bareFactoryCall('TaggedClass', tag, fields) }
          })),
        When('decideSchemaDeclarationIgnore examines the tag and fields')('results', (s) =>
          Effect.sync(() => {
            const tag = decideSchemaDeclarationIgnore(s.node.tag, s.node.call)
            const fields = decideSchemaDeclarationIgnore(s.node.fields, s.node.call)
            return { tag, fields }
          })),
        Then('both positions return undefined (only `Schema.TaggedClass` qualifies)')((s) =>
          Effect.sync(() => {
            expect(s.results.tag).toBeUndefined()
            expect(s.results.fields).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'A description string in a Symbol dot keyFor call stays live',
      Gherkin.Do.pipe(
        Given('a `Symbol.keyFor("desc")` call')('node', () =>
          Effect.sync(() => {
            const description = stringLiteral('desc')
            return { description, call: callOf(memberOf('Symbol', 'keyFor'), [description]) }
          })),
        When('decideSchemaDeclarationIgnore examines the argument')(
          'result',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.description, s.node.call)),
        ),
        Then('it returns undefined (member name is not `for`)')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'A description string in an Object dot for call stays live',
      Gherkin.Do.pipe(
        Given('a `Object.for("desc")` call')('node', () =>
          Effect.sync(() => {
            const description = stringLiteral('desc')
            return { description, call: callOf(memberOf('Object', 'for'), [description]) }
          })),
        When('decideSchemaDeclarationIgnore examines the argument')(
          'result',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.description, s.node.call)),
        ),
        Then('it returns undefined (object is not `Symbol`)')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'An arrow function default for an optional field is ignored',
      Gherkin.Do.pipe(
        Given('`S.optionalWith(S.String, () => default)`')('node', () =>
          Effect.sync(() => {
            const defaultFn = { type: 'ArrowFunctionExpression' }
            const schemaArg = memberOf('S', 'String')
            return { defaultFn, call: callOf(memberOf('S', 'optionalWith'), [schemaArg, defaultFn]) }
          })),
        When('decideSchemaDeclarationIgnore examines the default arrow function')(
          'result',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.defaultFn, s.node.call)),
        ),
        Then('it returns OPTIONAL_DEFAULT_IGNORED')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(OPTIONAL_DEFAULT_IGNORED)
          })
        ),
      ),
    )

    scenario(
      'A string literal default for an optional field stays live',
      Gherkin.Do.pipe(
        Given('`S.optionalWith(S.String, "x")`')('node', () =>
          Effect.sync(() => {
            const notFn = stringLiteral('x')
            const schemaArg = memberOf('S', 'String')
            return { notFn, call: callOf(memberOf('S', 'optionalWith'), [schemaArg, notFn]) }
          })),
        When('decideSchemaDeclarationIgnore examines the string-literal argument')(
          'result',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.notFn, s.node.call)),
        ),
        Then('it returns undefined (not an arrow)')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'An arrow function default outside optionalWith stays live',
      Gherkin.Do.pipe(
        Given('`S.optional(S.String, () => default)` — wrong callee')('node', () =>
          Effect.sync(() => {
            const defaultFn = { type: 'ArrowFunctionExpression' }
            const schemaArg = memberOf('S', 'String')
            return { defaultFn, call: callOf(memberOf('S', 'optional'), [schemaArg, defaultFn]) }
          })),
        When('decideSchemaDeclarationIgnore examines the default arrow function')(
          'result',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.defaultFn, s.node.call)),
        ),
        Then('it returns undefined (callee is `optional`, not `optionalWith`)')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'An annotations object holding only documentation is ignored in full',
      Gherkin.Do.pipe(
        Given('an `S.annotations({ identifier, description, title })` call with documentation only')(
          'node',
          () =>
            Effect.sync(() => {
              const documentation = objectOf([
                namedProperty('identifier', stringLiteral('HexBytes')),
                namedProperty('description', {
                  type: 'StringLiteral',
                  value: 'Uint8Array encoded as a lowercase hex string',
                }),
                namedProperty('title', stringLiteral('Hex Bytes')),
              ])
              const call = annotationsCall(documentation)
              return { documentation, call }
            }),
        ),
        When('decideSchemaDeclarationIgnore examines the object and each property value')(
          'results',
          (s) => {
            const objectReason = decideSchemaDeclarationIgnore(s.node.documentation, s.node.call)
            const valueReasons = s.node.documentation.properties.map((property) =>
              decideSchemaDeclarationIgnore(property.value, property, s.node.documentation, s.node.call)
            )
            return Effect.sync(() => ({ objectReason, valueReasons }))
          },
        ),
        Then('the object is ignored and every property value is ignored')((s) =>
          Effect.sync(() => {
            expect(s.results.objectReason).toBe(ANNOTATION_OBJECT_IGNORED)
            for (const reason of s.results.valueReasons) {
              expect(reason).toBe(ANNOTATION_TEXT_IGNORED)
            }
          })
        ),
      ),
    )

    scenario(
      'An annotations object mixing a generator with documentation keeps the generator live',
      Gherkin.Do.pipe(
        Given('`S.annotations({ arbitrary, identifier })` — one behaviour key plus a documentation key')(
          'node',
          () =>
            Effect.sync(() => {
              const mixed = objectOf([
                namedProperty('arbitrary', { type: 'ArrowFunctionExpression' }),
                namedProperty('identifier', stringLiteral('HexStringInput')),
              ])
              const call = annotationsCall(mixed)
              const properties = mixed.properties
              return { mixed, call, properties }
            }),
        ),
        When('decideSchemaDeclarationIgnore examines the object and each property')('results', (s) => {
          const objectReason = decideSchemaDeclarationIgnore(s.node.mixed, s.node.call)
          const generatorReason = decideSchemaDeclarationIgnore(
            s.node.properties[0]?.value,
            s.node.properties[0],
            s.node.mixed,
            s.node.call,
          )
          const documentationReason = decideSchemaDeclarationIgnore(
            s.node.properties[1]?.value,
            s.node.properties[1],
            s.node.mixed,
            s.node.call,
          )
          return Effect.sync(() => ({ objectReason, generatorReason, documentationReason }))
        }),
        Then('the object keeps its mutants, the generator keeps its mutants, the documentation value is ignored')(
          (s) =>
            Effect.sync(() => {
              expect(s.results.objectReason).toBeUndefined()
              expect(s.results.generatorReason).toBeUndefined()
              expect(s.results.documentationReason).toBe(ANNOTATION_TEXT_IGNORED)
            }),
        ),
      ),
    )

    scenario(
      'An annotations object holding only a generator stays live',
      Gherkin.Do.pipe(
        Given('`S.annotations({ arbitrary })` — only a generator')('node', () =>
          Effect.sync(() => {
            const generator = objectOf([namedProperty('arbitrary', { type: 'ArrowFunctionExpression' })])
            return { generator, call: annotationsCall(generator) }
          })),
        When('decideSchemaDeclarationIgnore examines the object')(
          'result',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.generator, s.node.call)),
        ),
        Then('it returns undefined (the arbitrary drives a property-test generator)')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'An empty annotations object stays live',
      Gherkin.Do.pipe(
        Given('`S.annotations({})` — empty documentation object')('node', () =>
          Effect.sync(() => {
            const empty = objectOf([])
            return { empty, call: annotationsCall(empty) }
          })),
        When('decideSchemaDeclarationIgnore examines the empty object')(
          'result',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.empty, s.node.call)),
        ),
        Then('it returns undefined (an empty object has no documentation entries to ignore)')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'A documentation object in the wrong argument position stays live',
      Gherkin.Do.pipe(
        Given('a documentation object passed to a non-annotations call')('node', () =>
          Effect.sync(() => {
            const documentation = objectOf([namedProperty('title', stringLiteral('Hex Bytes'))])
            const call = callOf(memberOf('S', 'annotations'), [
              stringLiteral('other'),
              documentation,
            ])
            return { documentation, call }
          })),
        When('decideSchemaDeclarationIgnore examines the second argument')(
          'result',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.documentation, s.node.call)),
        ),
        Then('it returns undefined (the documentation object is at the wrong argument slot)')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'A documentation object passed to a bare annotations call stays live',
      Gherkin.Do.pipe(
        Given('a call to a bare `annotations` identifier (not `S.annotations`)')('node', () =>
          Effect.sync(() => {
            const documentation = objectOf([namedProperty('title', stringLiteral('Hex Bytes'))])
            const call = callOf({ type: 'Identifier', name: 'annotations' }, [documentation])
            return { documentation, call }
          })),
        When('decideSchemaDeclarationIgnore examines the argument')(
          'result',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.documentation, s.node.call)),
        ),
        Then('it returns undefined (callee is not `S.annotations`)')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'A class identifier is ignored while its fields object stays live',
      Gherkin.Do.pipe(
        Given('a `Schema.Class<A>("ChildPolicyConfig")({ … })` call, whose id rides the inner call')(
          'node',
          () =>
            Effect.sync(() => {
              const id = stringLiteral('ChildPolicyConfig')
              const fields = objectExpression()
              const outer = classCall(id, fields)
              return { id, fields, outer, inner: outer.callee }
            }),
        ),
        When('decideSchemaDeclarationIgnore examines the identifier and the fields object')(
          'results',
          (s) =>
            Effect.sync(() => ({
              id: decideSchemaDeclarationIgnore(s.node.id, s.node.inner),
              fields: decideSchemaDeclarationIgnore(s.node.fields, s.node.outer),
            })),
        ),
        Then('the id is ignored and the fields object is not: a fields subtree carries accepted value sets')((s) =>
          Effect.sync(() => {
            expect(s.results.id).toBe(CLASS_ID_IGNORED)
            expect(s.results.fields).toBeUndefined()
          })
        ),
      ),
    )

    scenario(
      'A brand name string is ignored',
      Gherkin.Do.pipe(
        Given('an `S.brand("MaxChildren")` call')('node', () =>
          Effect.sync(() => {
            const name = stringLiteral('MaxChildren')
            return { name, call: brandCall(name) }
          })),
        When('decideSchemaDeclarationIgnore examines the brand name')(
          'result',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.name, s.node.call)),
        ),
        Then('it is ignored: the brand name is identity data, like a Symbol.for description')((s) =>
          Effect.sync(() => {
            expect(s.result).toBe(BRAND_NAME_IGNORED)
          })
        ),
      ),
    )

    scenario(
      'Accepted literal values inside class fields stay live',
      Gherkin.Do.pipe(
        Given('a `Schema.Literal("permanent", "transient")` inside a `Schema.Class` fields object')(
          'node',
          () =>
            Effect.sync(() => {
              const member = stringLiteral('permanent')
              const literal = callOf(memberOf('Schema', 'Literal'), [member, {
                type: 'StringLiteral',
                value: 'transient',
              }])
              const fields = objectOf([namedProperty('restart', literal)])
              return { member, literal, outer: classCall(stringLiteral('C'), fields) }
            }),
        ),
        When('decideSchemaDeclarationIgnore examines one accepted literal')(
          'result',
          (s) => Effect.sync(() => decideSchemaDeclarationIgnore(s.node.member, s.node.literal)),
        ),
        Then('it is NOT ignored: which values decode is behaviour, not declaration identity')((s) =>
          Effect.sync(() => {
            expect(s.result).toBeUndefined()
          })
        ),
      ),
    )
  })
