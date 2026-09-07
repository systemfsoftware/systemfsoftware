import * as NodeFileSystem from '@effect/platform-node-shared/NodeFileSystem'
import * as NodePath from '@effect/platform-node-shared/NodePath'
import { Gherkin, Given, it, layer, makeFeature, Then, When } from '@systemfsoftware/effect-gherkin-spec'
import { Ignorer, type NodePath as StrykerNodePath } from '@systemfsoftware/stryker-js/Ignorer'
import { RunConfiguration, SandboxDirectory } from '@systemfsoftware/stryker-js/Plugin'
import { StrykerOptionsSchema } from '@systemfsoftware/stryker-js/Schema'
import { strykerPlugins } from '@systemfsoftware/stryker-plugins/effect-schema-ignorer'
import { Effect } from 'effect'
import * as Context from 'effect/Context'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { expect } from 'vitest'

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
import { nodeModuleTestLayer } from '../__fixtures__/NodePlatform.fixtures.js'

const Feature = makeFeature({ it, layer })

const stubPath = (node: unknown, parent?: StrykerNodePath | null): StrykerNodePath => {
  const base = {
    node,
    isObjectExpression: () => false,
    isCallExpression: () => false,
    isClassProperty: () => false,
    isClassPrivateProperty: () => false,
    isClassAccessorProperty: () => false,
  }
  if (parent === undefined) {
    return base
  }
  return { ...base, parentPath: parent }
}

const pathOf = (node: unknown, ancestors: readonly unknown[]): StrykerNodePath => {
  let parent: StrykerNodePath | null | undefined = undefined
  for (let index = ancestors.length - 1; index >= 0; index--) {
    parent = stubPath(ancestors[index], parent ?? undefined)
  }
  return stubPath(node, parent ?? undefined)
}

const ignorerLive = Effect.gen(function*() {
  const plugin = strykerPlugins[0]
  if (plugin === undefined) {
    return yield* Effect.die(new Error('effect-schema-declarations plugin missing'))
  }
  const options = Schema.decodeUnknownSync(StrykerOptionsSchema)({})
  const env = Layer.mergeAll(
    Layer.succeed(RunConfiguration, options),
    Layer.succeed(SandboxDirectory, '/tmp'),
    NodeFileSystem.layer,
    NodePath.layer,
    nodeModuleTestLayer,
  )
  const context = yield* Layer.build(plugin.layer.pipe(Layer.provide(env)))
  return Context.get(context, Ignorer)
})

const ignoredBy = (node: unknown, ancestors: readonly unknown[]) =>
  Effect.gen(function*() {
    const ignorer = yield* ignorerLive
    return ignorer.shouldIgnore(pathOf(node, ancestors))
  })

const expectIgnored = (result: Option.Option<string>): void => {
  expect(Option.isSome(result)).toBe(true)
}

const expectLive = (result: Option.Option<string>): void => {
  expect(Option.isNone(result)).toBe(true)
}

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
        When('the schema ignorer examines the tag and fields through the public layer')(
          'results',
          (s) =>
            Effect.gen(function*() {
              const tag = yield* ignoredBy(s.node.tag, [s.node.call])
              const fields = yield* ignoredBy(s.node.fields, [s.node.call])
              return { tag, fields }
            }),
        ),
        Then('both positions stay live (only `Schema.TaggedClass` qualifies)')((s) =>
          Effect.sync(() => {
            expectLive(s.results.tag)
            expectLive(s.results.fields)
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
        When('the schema ignorer examines the argument through the public layer')(
          'result',
          (s) => ignoredBy(s.node.description, [s.node.call]),
        ),
        Then('it stays live (member name is not `for`)')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
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
        When('the schema ignorer examines the argument through the public layer')(
          'result',
          (s) => ignoredBy(s.node.description, [s.node.call]),
        ),
        Then('it stays live (object is not `Symbol`)')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
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
        When('the schema ignorer examines the default arrow function through the public layer')(
          'result',
          (s) => ignoredBy(s.node.defaultFn, [s.node.call]),
        ),
        Then('it is ignored as an optional default')((s) =>
          Effect.sync(() => {
            expectIgnored(s.result)
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
        When('the schema ignorer examines the string-literal argument through the public layer')(
          'result',
          (s) => ignoredBy(s.node.notFn, [s.node.call]),
        ),
        Then('it stays live (not an arrow)')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
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
        When('the schema ignorer examines the default arrow function through the public layer')(
          'result',
          (s) => ignoredBy(s.node.defaultFn, [s.node.call]),
        ),
        Then('it stays live (callee is `optional`, not `optionalWith`)')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
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
                  type: 'Literal',
                  value: 'Uint8Array encoded as a lowercase hex string',
                }),
                namedProperty('title', stringLiteral('Hex Bytes')),
              ])
              const call = annotationsCall(documentation)
              return { documentation, call }
            }),
        ),
        When('the schema ignorer examines the object and each property value through the public layer')(
          'results',
          (s) =>
            Effect.gen(function*() {
              const objectReason = yield* ignoredBy(s.node.documentation, [s.node.call])
              const valueReasons: Array<Option.Option<string>> = []
              for (const property of s.node.documentation.properties) {
                valueReasons.push(yield* ignoredBy(property.value, [property, s.node.documentation, s.node.call]))
              }
              return { objectReason, valueReasons }
            }),
        ),
        Then('the object is ignored and every property value is ignored')((s) =>
          Effect.sync(() => {
            expectIgnored(s.results.objectReason)
            for (const reason of s.results.valueReasons) {
              expectIgnored(reason)
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
        When('the schema ignorer examines the object and each property through the public layer')(
          'results',
          (s) =>
            Effect.gen(function*() {
              const first = s.node.properties[0]
              const second = s.node.properties[1]
              const objectReason = yield* ignoredBy(s.node.mixed, [s.node.call])
              const generatorReason = first === undefined
                ? Option.none<string>()
                : yield* ignoredBy(first.value, [first, s.node.mixed, s.node.call])
              const documentationReason = second === undefined
                ? Option.none<string>()
                : yield* ignoredBy(second.value, [second, s.node.mixed, s.node.call])
              return { objectReason, generatorReason, documentationReason }
            }),
        ),
        Then('the object keeps its mutants, the generator keeps its mutants, the documentation value is ignored')(
          (s) =>
            Effect.sync(() => {
              expectLive(s.results.objectReason)
              expectLive(s.results.generatorReason)
              expectIgnored(s.results.documentationReason)
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
        When('the schema ignorer examines the object through the public layer')(
          'result',
          (s) => ignoredBy(s.node.generator, [s.node.call]),
        ),
        Then('it stays live (the arbitrary drives a property-test generator)')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
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
        When('the schema ignorer examines the empty object through the public layer')(
          'result',
          (s) => ignoredBy(s.node.empty, [s.node.call]),
        ),
        Then('it stays live (an empty object has no documentation entries to ignore)')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
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
        When('the schema ignorer examines the second argument through the public layer')(
          'result',
          (s) => ignoredBy(s.node.documentation, [s.node.call]),
        ),
        Then('it stays live (the documentation object is at the wrong argument slot)')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
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
        When('the schema ignorer examines the argument through the public layer')(
          'result',
          (s) => ignoredBy(s.node.documentation, [s.node.call]),
        ),
        Then('it stays live (callee is not `S.annotations`)')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
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
        When('the schema ignorer examines the identifier and the fields object through the public layer')(
          'results',
          (s) =>
            Effect.gen(function*() {
              const id = yield* ignoredBy(s.node.id, [s.node.inner])
              const fields = yield* ignoredBy(s.node.fields, [s.node.outer])
              return { id, fields }
            }),
        ),
        Then('the id is ignored and the fields object is not: a fields subtree carries accepted value sets')((s) =>
          Effect.sync(() => {
            expectIgnored(s.results.id)
            expectLive(s.results.fields)
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
        When('the schema ignorer examines the brand name through the public layer')(
          'result',
          (s) => ignoredBy(s.node.name, [s.node.call]),
        ),
        Then('it is ignored: the brand name is identity data, like a Symbol.for description')((s) =>
          Effect.sync(() => {
            expectIgnored(s.result)
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
                type: 'Literal',
                value: 'transient',
              }])
              const fields = objectOf([namedProperty('restart', literal)])
              return { member, literal, outer: classCall(stringLiteral('C'), fields) }
            }),
        ),
        When('the schema ignorer examines one accepted literal through the public layer')(
          'result',
          (s) => ignoredBy(s.node.member, [s.node.literal]),
        ),
        Then('it stays live: which values decode is behaviour, not declaration identity')((s) =>
          Effect.sync(() => {
            expectLive(s.result)
          })
        ),
      ),
    )
  })
