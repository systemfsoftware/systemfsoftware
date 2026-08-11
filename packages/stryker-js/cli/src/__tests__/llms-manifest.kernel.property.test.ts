import * as Command from '@effect/cli/Command'
import * as Options from '@effect/cli/Options'
import { describe } from '@effect/vitest'
import { it } from '@systemfsoftware/effect-gherkin-spec'
import { Effect, FastCheck as fc } from 'effect'
import { isDeepStrictEqual } from 'node:util'

import {
  buildLLMSManifest,
  emitLLMSManifest,
  LLMS_MANIFEST_SCHEMA_VERSION,
  type LLMSManifest,
} from '../llms-manifest.kernel.js'

type OptionRecipe = {
  readonly name: string
  readonly kind: 'text' | 'boolean' | 'integer' | 'choice'
  readonly optional: boolean
}

type SubcommandRecipe = {
  readonly name: string
  readonly options: readonly OptionRecipe[]
}

type CommandRecipe = {
  readonly name: string
  readonly options: readonly OptionRecipe[]
  readonly subcommands: SubcommandList
}

/**
 * Subcommands are fixed-arity tuples so the constructed command's type
 * narrows without a cast: the destructured pair is fully defined on every
 * variant, and both `withSubcommands` branches yield the same command type.
 */
type SubcommandList =
  | readonly [SubcommandRecipe]
  | readonly [SubcommandRecipe, SubcommandRecipe]

const optionNameArb = fc.constantFrom('alpha', 'beta', 'gamma', 'delta', 'epsilon')

const optionRecipeArb: fc.Arbitrary<OptionRecipe> = fc.record({
  name: optionNameArb,
  kind: fc.constantFrom('text', 'boolean', 'integer', 'choice'),
  optional: fc.boolean(),
})

const commandNameArb = fc.constantFrom('stryker', 'tool', 'ctl')

const subcommandRecipeArb: fc.Arbitrary<SubcommandRecipe> = fc.record({
  name: commandNameArb,
  options: fc.uniqueArray(optionRecipeArb, { maxLength: 4, selector: (option) => option.name }),
})

const subcommandListArb: fc.Arbitrary<SubcommandList> = fc.oneof(
  fc.tuple(subcommandRecipeArb),
  fc.tuple(subcommandRecipeArb, subcommandRecipeArb)
    .filter(([first, second]) => first.name !== second.name),
)

const commandRecipeArb: fc.Arbitrary<CommandRecipe> = fc.record({
  name: commandNameArb,
  options: fc.uniqueArray(optionRecipeArb, { maxLength: 4, selector: (option) => option.name }),
  subcommands: subcommandListArb,
})

const versionArb = fc.string({ maxLength: 16 })

const KIND_BY_RECIPE = {
  text: 'text',
  boolean: 'boolean',
  integer: 'integer',
  choice: 'choice',
} as const

const optionOf = (recipe: OptionRecipe): Options.Options<unknown> => {
  const base: Options.Options<unknown> = recipe.kind === 'text'
    ? Options.text(recipe.name)
    : recipe.kind === 'boolean'
    ? Options.boolean(recipe.name)
    : recipe.kind === 'integer'
    ? Options.integer(recipe.name)
    : Options.choice(recipe.name, ['one', 'two', 'three'])
  return recipe.optional ? Options.optional(base) : base
}

const configOf = (options: readonly OptionRecipe[]): Record<string, Options.Options<unknown>> => {
  const config: Record<string, Options.Options<unknown>> = {}
  for (const option of options) {
    config[option.name] = optionOf(option)
  }
  return config
}

const buildSubcommand = (recipe: SubcommandRecipe) =>
  Command.make(recipe.name, configOf(recipe.options), () => Effect.void)

const buildCommand = (recipe: CommandRecipe) => {
  const command = Command.make(recipe.name, configOf(recipe.options), () => Effect.void)
  const [first, second] = recipe.subcommands
  if (second === undefined) {
    return Command.withSubcommands(command, [buildSubcommand(first)])
  }
  return Command.withSubcommands(command, [buildSubcommand(first), buildSubcommand(second)])
}

const manifestOf = (recipe: CommandRecipe, version: string): LLMSManifest =>
  buildLLMSManifest(buildCommand(recipe), version)

describe('buildLLMSManifest — document shape', () => {
  it.prop('∀cv_ManifestShape_≡Declared', [commandRecipeArb, versionArb], ([recipe, version]) => {
    const manifest = manifestOf(recipe, version)
    const root = manifest.commands[0]
    return root !== undefined &&
      manifest.schemaVersion === LLMS_MANIFEST_SCHEMA_VERSION &&
      manifest.version === version &&
      manifest.tool === recipe.name &&
      manifest.commands.length === 1 &&
      root.name === recipe.name
  })

  it.prop('∀c_ManifestDeterminism_≡Stable', [commandRecipeArb, versionArb], ([recipe, version]) => {
    const command = buildCommand(recipe)
    return isDeepStrictEqual(
      buildLLMSManifest(command, version),
      buildLLMSManifest(command, version),
    )
  })
})

describe('buildLLMSManifest — the anti-drift walk', () => {
  it.prop('∀c_Options_≡ExactlyDeclared', [commandRecipeArb], ([recipe]) => {
    const manifest = manifestOf(recipe, '1.2.5')
    const root = manifest.commands[0]
    if (root === undefined) {
      return false
    }
    const declaredNames = recipe.options.map((option) => option.name).sort()
    const manifestNames = root.options.map((option) => option.name).sort()
    return isDeepStrictEqual(manifestNames, declaredNames) &&
      root.options.every((option) => {
        const declared = recipe.options.find((candidate) => candidate.name === option.name)
        return declared !== undefined &&
          option.kind === KIND_BY_RECIPE[declared.kind] &&
          option.required === !(declared.optional || declared.kind === 'boolean')
      })
  })

  it.prop('∀c_Subcommands_≡ExactlyDeclared', [commandRecipeArb], ([recipe]) => {
    const deepEqual = isDeepStrictEqual
    const manifest = manifestOf(recipe, '1.2.5')
    const root = manifest.commands[0]
    if (root === undefined) {
      return false
    }
    const declaredNames = recipe.subcommands.map((subcommand) => subcommand.name).sort()
    const manifestNames = root.subcommands.map((subcommand) => subcommand.name).sort()
    return deepEqual(manifestNames, declaredNames) &&
      root.subcommands.every((subcommand) => {
        const declared = recipe.subcommands.find((candidate) => candidate.name === subcommand.name)
        if (declared === undefined) {
          return false
        }
        const declaredOptionNames = declared.options.map((option) => option.name).sort()
        const manifestOptionNames = subcommand.options.map((option) => option.name).sort()
        return deepEqual(manifestOptionNames, declaredOptionNames)
      })
  })
})

describe('emitLLMSManifest', () => {
  it.prop('∀cv_Emit_≡BuildRoundTrip', [commandRecipeArb, versionArb], ([recipe, version]) =>
    isDeepStrictEqual(
      JSON.parse(emitLLMSManifest(buildCommand(recipe), version)),
      manifestOf(recipe, version),
    ))
})
