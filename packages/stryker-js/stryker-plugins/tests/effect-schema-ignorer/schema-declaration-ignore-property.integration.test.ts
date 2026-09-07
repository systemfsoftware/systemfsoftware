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
        When('the schema ignorer examines the description argument through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.description, [s.node.call]),
        ),
        Then('it is ignored as identity-only data')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
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
        When('the schema ignorer examines the tag argument through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.tag, [s.node.call]),
        ),
        Then('it is ignored as a declaration discriminant')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
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
        When('the schema ignorer examines the tag argument through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.tag, [s.node.call]),
        ),
        Then('it is ignored as a declaration discriminant')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
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
        When('the schema ignorer examines the fields argument through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.fields, [s.node.call]),
        ),
        Then('it is ignored as a declaration')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
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
        When('the schema ignorer examines the fields argument through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.fields, [s.node.call]),
        ),
        Then('it is ignored as a declaration')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
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
        When('the schema ignorer examines the description argument through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.description, [s.node.call]),
        ),
        Then('it stays live (member name is not `for`)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
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
        When('the schema ignorer examines the tag and fields arguments through the public layer')(
          'results',
          (s) =>
            Effect.gen(function*() {
              const tag = yield* ignoredBy(s.node.tag, [s.node.call])
              const fields = yield* ignoredBy(s.node.fields, [s.node.call])
              return { tag, fields }
            }),
        ),
        Then('both stay live')((s) =>
          Effect.sync(() => {
            expectLive(s.results.tag)
            expectLive(s.results.fields)
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
        When('the schema ignorer examines the first argument through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.fields, [s.node.call]),
        ),
        Then('it stays live (the object expression is at the tag slot, not fields)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
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
        When('the schema ignorer examines the argument through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.node, [s.node.call]),
        ),
        Then('it stays live (not a string literal)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
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
        When('the schema ignorer examines the description string through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.description, [s.node.call]),
        ),
        Then('it stays live (this string is not the Symbol.for argument)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
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
        When('the schema ignorer examines the tag argument through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.tag, [s.node.call]),
        ),
        Then('it stays live (Match.tag is a runtime discriminator, not a declaration)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
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
        When('the schema ignorer examines the orphan through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.node, []),
        ),
        Then('it stays live (no parent context means no decision)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
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
        When('the schema ignorer examines the description argument through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.node, [s.node.parent]),
        ),
        Then('it is ignored — never an arbitrary new reason')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
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
        When('the schema ignorer examines the object and the value through the public layer')(
          'reasons',
          (s) =>
            Effect.gen(function*() {
              const objectReason = yield* ignoredBy(s.node.object, [s.node.call])
              const first = s.node.object.properties[0]
              const valueReason = first === undefined
                ? Option.none<string>()
                : yield* ignoredBy(first.value, [first, s.node.object, s.node.call])
              return { objectReason, valueReason }
            }),
        ),
        Then('the object is ignored and the value is ignored')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reasons.objectReason)
            expectIgnored(s.reasons.valueReason)
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
        When('the schema ignorer examines the object through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.object, [s.node.call]),
        ),
        Then('it is ignored as documentation')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
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
        When('the schema ignorer examines the object and the description value through the public layer')(
          'reasons',
          (s) =>
            Effect.gen(function*() {
              const objectReason = yield* ignoredBy(s.node.object, [s.node.call])
              const first = s.node.object.properties[0]
              const valueReason = first === undefined
                ? Option.none<string>()
                : yield* ignoredBy(first.value, [first, s.node.object, s.node.call])
              return { objectReason, valueReason }
            }),
        ),
        Then('the object stays live but the documentation value is ignored')((s) =>
          Effect.sync(() => {
            expectLive(s.reasons.objectReason)
            expectIgnored(s.reasons.valueReason)
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
        When('the schema ignorer examines the value through the public layer')('reason', (s) =>
          Effect.gen(function*() {
            const first = s.node.object.properties[0]
            if (first === undefined) {
              return Option.none<string>()
            }
            return yield* ignoredBy(first.value, [first, s.node.object, s.node.call])
          })),
        Then('it stays live (behaviour values are never ignored)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
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
        When('the schema ignorer examines the object through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.object, [s.node.call]),
        ),
        Then('it stays live (the object holds behaviour, not documentation)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
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
        When('the schema ignorer examines the object and the value through the public layer')(
          'reasons',
          (s) =>
            Effect.gen(function*() {
              const objectReason = yield* ignoredBy(s.node.object, [s.node.call])
              const first = s.node.object.properties[0]
              const valueReason = first === undefined
                ? Option.none<string>()
                : yield* ignoredBy(first.value, [first, s.node.object, s.node.call])
              return { objectReason, valueReason }
            }),
        ),
        Then('neither the object nor the value is ignored (the documentation key is not a string literal)')((s) =>
          Effect.sync(() => {
            expectLive(s.reasons.objectReason)
            expectLive(s.reasons.valueReason)
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
        When('the schema ignorer examines the argument through the public layer')(
          'reason',
          (s) => ignoredBy(s.node.object, [s.node.call]),
        ),
        Then('it stays live (the callee is `S.filter`, not `S.annotations`)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
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
        When('the schema ignorer examines the value through the public layer')('reason', (s) =>
          Effect.gen(function*() {
            const first = s.node.object.properties[0]
            if (first === undefined) {
              return Option.none<string>()
            }
            return yield* ignoredBy(first.value, [first, s.node.object, s.node.call])
          })),
        Then('it stays live (no annotations call owns the slot)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
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
        When('the schema ignorer examines the value with a chain ending at the object through the public layer')(
          'reason',
          (s) =>
            Effect.gen(function*() {
              const first = s.node.object.properties[0]
              if (first === undefined) {
                return Option.none<string>()
              }
              return yield* ignoredBy(first.value, [first, s.node.object])
            }),
        ),
        Then('it stays live (no call expression in scope means no annotations rule applies)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
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
        When('the schema ignorer examines the value at index 1 through the public layer')(
          'reason',
          (s) =>
            Effect.gen(function*() {
              const first = s.node.object.properties[0]
              if (first === undefined) {
                return Option.none<string>()
              }
              return yield* ignoredBy(first.value, [first, s.node.object, s.node.call])
            }),
        ),
        Then('it stays live (the annotations rule only fires at argument index 0)')((s) =>
          Effect.sync(() => {
            expectLive(s.reason)
          })
        ),
      ),
    )

    scenario(
      'A property key is ignored through the ancestor walk when its annotations object holds only documentation',
      Gherkin.Do.pipe(
        Given('an annotations call holding only documentation')('node', () =>
          Effect.sync(() => {
            const object = objectOf([
              namedProperty('identifier', stringLiteral('HexBytes')),
            ])
            const call = annotationsCall(object)
            return { object, call }
          })),
        When('the schema ignorer examines the property key through the public layer')(
          'reason',
          (s) =>
            Effect.gen(function*() {
              const first = s.node.object.properties[0]
              if (first === undefined) {
                return Option.none<string>()
              }
              return yield* ignoredBy(first.key, [first, s.node.object, s.node.call])
            }),
        ),
        Then('it is ignored because the ancestor walk reaches the documentation object')((s) =>
          Effect.sync(() => {
            expectIgnored(s.reason)
          })
        ),
      ),
    )
  })
