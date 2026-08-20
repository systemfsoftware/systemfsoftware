/// <reference types="vitest/import-meta" />
import { PluginKind } from '@systemfsoftware/stryker-js-plugin-api/plugin'
import type * as Command from 'effect/unstable/cli/Command'
import type * as Flag from 'effect/unstable/cli/Flag'

import { strykerPlugins } from '@systemfsoftware/stryker-js-mutation-report/stryker-plugins'

// =============================================================================
// U11 — the `--llms` command manifest (R13)
//
// The v4 CLI has no manifest serializer, so the emitter is hand-built — but
// never from a list maintained alongside the CLI. Every field is read by
// walking the command's own compiled structures: the config tree
// (`Command.make`'s processed flag/argument records) and the public
// `name`/`description`/`subcommands` fields. A `Single` param node carries
// its name, aliases, primitive type (kind, and the alternatives of a choice)
// and description; an `Optional` wrapper marks the parameter optional. The
// framework keeps the compiled tree internal (`Command.Config` is opaque at
// the type level), so the walk narrows the runtime values with
// `_tag`-discriminated case switches — never casts.
//
// The consequence is the anti-drift property: a newly added option appears in
// the manifest with no change to any code here, because the manifest is
// derived from the compiled config, not from a parallel list. The drift guard
// test proves it by constructing a command carrying an extra option and
// asserting the emitter picks it up.
//
// The one value the compiled tree does not carry — the allowed reporter
// names — comes from the U9 reporter registry (pruned to the five
// survivors), never from a literal.
// =============================================================================

/** The manifest's schema version, matching the U4 envelope convention. */
export const LLMS_MANIFEST_SCHEMA_VERSION = '1.0'

export interface LLMSManifestOption {
  readonly name: string
  readonly aliases: readonly string[]
  readonly kind: string
  readonly required: boolean
  readonly default?: unknown
  readonly choices?: readonly string[]
  readonly description: string
}

export interface LLMSManifestArg {
  readonly name: string
  readonly kind: string
  readonly required: boolean
  readonly description: string
}

export interface LLMSManifestCommand {
  readonly name: string
  readonly description: string
  readonly options: readonly LLMSManifestOption[]
  readonly args: readonly LLMSManifestArg[]
  readonly subcommands: readonly LLMSManifestCommand[]
}

/** The full manifest document, emitted as one JSON object. */
export interface LLMSManifest {
  readonly schemaVersion: '1.0'
  readonly tool: string
  readonly version: string
  readonly commands: readonly LLMSManifestCommand[]
}

// -----------------------------------------------------------------------------
// Runtime narrowing: the compiled config shapes are framework-internal, so the
// walk reads them through `_tag`-discriminated case switches.
// -----------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(node: Record<string, unknown>, key: string): string | undefined {
  const value = node[key]
  return typeof value === 'string' ? value : undefined
}

function stringArrayField(node: Record<string, unknown>, key: string): readonly string[] {
  const value = node[key]
  if (!Array.isArray(value)) {
    return []
  }
  const strings: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      strings.push(item)
    }
  }
  return strings
}

/** The compiled shapes discriminate on `_tag`; read it once, off the record. */
function tagOf(node: Record<string, unknown>): unknown {
  return node['_tag']
}

function walkParam(
  param: unknown,
  isOptional: boolean,
  out: { readonly flags: LLMSManifestOption[]; readonly args: LLMSManifestArg[] },
): void {
  if (!isObject(param)) {
    return
  }
  switch (tagOf(param)) {
    case 'Single':
      describeSingle(param, isOptional, out)
      return
    case 'Map':
    case 'Transform':
      walkParam(param['param'], isOptional, out)
      return
    case 'Optional':
      walkParam(param['param'], true, out)
      return
    case 'Variadic':
      walkParam(param['param'], isOptional, out)
      return
    default:
      // A param tag this emitter does not know cannot describe a declared
      // option; the drift guard test fails the day one appears.
      return
  }
}

// -----------------------------------------------------------------------------
// Primitive kinds and choice alternatives. The compiled primitives carry
// canonical tag names; the map below is the manifest's stable, human-readable
// kind. The `required` flag must mirror the help renderer's Boolean
// carve-out (a bare boolean flag has an implicit `false` default, so it is
// never "required" whatever its wrapper says).
// -----------------------------------------------------------------------------

const PRIMITIVE_KIND: Readonly<Record<string, string>> = {
  Boolean: 'boolean',
  Choice: 'choice',
  Date: 'date',
  FileParse: 'file',
  FileSchema: 'file',
  FileText: 'file',
  Float: 'float',
  Integer: 'integer',
  KeyValuePair: 'key=value',
  None: 'none',
  Path: 'path',
  Redacted: 'redacted',
  String: 'text',
}

function kindOf(primitive: Record<string, unknown>): string {
  const tag = stringField(primitive, '_tag')
  return tag === undefined ? 'unknown' : PRIMITIVE_KIND[tag] ?? tag
}

function choiceValues(primitive: Record<string, unknown>): readonly string[] | undefined {
  const keys = primitive['choiceKeys']
  if (!Array.isArray(keys)) {
    return undefined
  }
  const values: string[] = []
  for (const key of keys) {
    if (typeof key === 'string') {
      values.push(key)
    }
  }
  return values
}

/** The allowed reporter names, read from the U9 registry — the same list the plugin loader accepts. */
const REPORTER_NAMES: readonly string[] = strykerPlugins
  .filter((plugin) => plugin.kind === PluginKind.Reporter)
  .map((plugin) => plugin.name)

/**
 * v4 option descriptions are stored as `Option.some(string)` on the compiled
 * `Single`; the walker unwraps the option.
 */
function descriptionOf(single: Record<string, unknown>): string {
  const description = single['description']
  if (!isObject(description)) {
    return ''
  }
  switch (tagOf(description)) {
    case 'Some': {
      const value = description['value']
      return typeof value === 'string' ? value : ''
    }
    default:
      return ''
  }
}

function describeSingle(
  single: Record<string, unknown>,
  isOptional: boolean,
  out: { readonly flags: LLMSManifestOption[]; readonly args: LLMSManifestArg[] },
): void {
  const name = stringField(single, 'name') ?? ''
  const primitive = isObject(single['primitiveType']) ? single['primitiveType'] : {}
  const kind = kindOf(primitive)
  // `reporters` is a plain text option, so its allowed value set lives
  // nowhere in its compiled node — it is the registry, read at module load so
  // the manifest and the plugin loader cannot drift.
  const choices = name === 'reporters'
    ? REPORTER_NAMES
    : kind === 'choice'
    ? choiceValues(primitive)
    : undefined
  const description = descriptionOf(single)
  const required = kind !== 'boolean' && !isOptional
  const described: LLMSManifestOption = {
    name,
    aliases: stringArrayField(single, 'aliases'),
    kind,
    required,
    ...(choices !== undefined ? { choices } : {}),
    description,
  }
  const isArgument = single['kind'] === 'argument'
  if (isArgument) {
    out.args.push({
      name,
      kind,
      required,
      description,
    })
    return
  }
  out.flags.push(described)
}

// -----------------------------------------------------------------------------
// The config tree walk: one `Param` node per declared flag/argument. The tree
// preserves the command's declaration shape, so walking it in object-key order
// keeps the manifest's option/arg order aligned with the declaration.
// -----------------------------------------------------------------------------

function walkConfigNode(
  node: unknown,
  orderedParams: readonly unknown[],
  out: { readonly flags: LLMSManifestOption[]; readonly args: LLMSManifestArg[] },
): void {
  if (!isObject(node)) {
    return
  }
  switch (tagOf(node)) {
    case 'Param': {
      const index = node['index']
      const param = typeof index === 'number' ? orderedParams[index] : undefined
      if (param !== undefined) {
        walkParam(param, false, out)
      }
      return
    }
    case 'Array':
      if (Array.isArray(node['children'])) {
        for (const child of node['children']) {
          walkConfigNode(child, orderedParams, out)
        }
      }
      return
    case 'Nested':
      if (isObject(node['tree'])) {
        walkConfigTree(node['tree'], orderedParams, out)
      }
      return
    default:
      return
  }
}

function walkConfigTree(
  tree: Record<string, unknown>,
  orderedParams: readonly unknown[],
  out: { readonly flags: LLMSManifestOption[]; readonly args: LLMSManifestArg[] },
): void {
  for (const key of Object.keys(tree)) {
    void key
    walkConfigNode(tree[key], orderedParams, out)
  }
}

// -----------------------------------------------------------------------------
// The command walk: name/description from the public fields, flags/args from
// the compiled config tree, and subcommands from the grouped `subcommands`
// list (each group entry is a declared child command).
// -----------------------------------------------------------------------------

function describeCommandNode(node: unknown): LLMSManifestCommand | undefined {
  if (!isObject(node)) {
    return undefined
  }
  const out: { readonly flags: LLMSManifestOption[]; readonly args: LLMSManifestArg[] } = {
    flags: [],
    args: [],
  }
  // The compiled config is not part of the public `Command` type, but it is
  // the object the parser itself reads (`config.tree` + `config.orderedParams`
  // are assigned by the command constructor).
  const config = node['config']
  if (isObject(config) && isObject(config['tree'])) {
    const orderedParams = Array.isArray(config['orderedParams']) ? config['orderedParams'] : []
    walkConfigTree(config['tree'], orderedParams, out)
  }
  const subcommands: LLMSManifestCommand[] = []
  const grouped = node['subcommands']
  if (Array.isArray(grouped)) {
    for (const group of grouped) {
      if (!isObject(group) || !Array.isArray(group['commands'])) {
        continue
      }
      for (const child of group['commands']) {
        const described = describeCommandNode(child)
        if (described !== undefined) {
          subcommands.push(described)
        }
      }
    }
  }
  return {
    name: stringField(node, 'name') ?? '',
    description: typeof node['description'] === 'string' ? node['description'] : '',
    options: out.flags,
    args: out.args,
    subcommands,
  }
}

/**
 * Builds the manifest document for a command, walking its compiled form (the
 * same structure the parser matches against). `version` is the tool version,
 * passed in so this module stays free of package state.
 */
export function buildLLMSManifest(command: Command.Command.Any, version: string): LLMSManifest {
  const root = describeCommandNode(command) ?? {
    name: '',
    description: '',
    options: [],
    args: [],
    subcommands: [],
  }
  return {
    schemaVersion: LLMS_MANIFEST_SCHEMA_VERSION,
    tool: root.name,
    version,
    commands: [root],
  }
}

/** The manifest as one JSON document, ready for stdout — the U4 convention. */
export function emitLLMSManifest(command: Command.Command.Any, version: string): string {
  return JSON.stringify(buildLLMSManifest(command, version))
}

/** Option-kind mapping the in-source law compares against. */
const KIND_BY_RECIPE = {
  text: 'text',
  boolean: 'boolean',
  integer: 'integer',
  choice: 'choice',
} as const

if (import.meta.vitest !== void 0) {
  // Dynamic by necessity: tsdown defines `import.meta.vitest` as `undefined`,
  // so this branch is statically dead in the build and the runner never enters
  // the published module graph. A static import would ship it.
  const { describe, it } = await import('@systemfsoftware/effect-gherkin-spec')
  const { Effect } = await import('effect')
  const { FastCheck: fc } = await import('effect/testing')
  const CommandApi = await import('effect/unstable/cli/Command')
  const FlagApi = await import('effect/unstable/cli/Flag')
  const { isDeepStrictEqual } = await import('node:util')

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

  const optionRecipeArb = fc.record({
    name: optionNameArb,
    kind: fc.constantFrom('text', 'boolean', 'integer', 'choice'),
    optional: fc.boolean(),
  })

  const commandNameArb = fc.constantFrom('stryker', 'tool', 'ctl')

  const subcommandRecipeArb = fc.record({
    name: commandNameArb,
    options: fc.uniqueArray(optionRecipeArb, { maxLength: 4, selector: (option) => option.name }),
  })

  const subcommandListArb = fc.oneof(
    fc.tuple(subcommandRecipeArb),
    fc.tuple(subcommandRecipeArb, subcommandRecipeArb)
      .filter(([first, second]) => first.name !== second.name),
  )

  const commandRecipeArb = fc.record({
    name: commandNameArb,
    options: fc.uniqueArray(optionRecipeArb, { maxLength: 4, selector: (option) => option.name }),
    subcommands: subcommandListArb,
  })

  const versionArb = fc.string({ maxLength: 16 })

  const optionOf = (recipe: OptionRecipe): Flag.Flag<unknown> => {
    const base: Flag.Flag<unknown> = recipe.kind === 'text'
      ? FlagApi.string(recipe.name)
      : recipe.kind === 'boolean'
      ? FlagApi.boolean(recipe.name)
      : recipe.kind === 'integer'
      ? FlagApi.integer(recipe.name)
      : FlagApi.choice(recipe.name, ['one', 'two', 'three'])
    return recipe.optional ? FlagApi.optional(base) : base
  }

  const configOf = (options: readonly OptionRecipe[]): Record<string, Flag.Flag<unknown>> => {
    const config: Record<string, Flag.Flag<unknown>> = {}
    for (const option of options) {
      config[option.name] = optionOf(option)
    }
    return config
  }

  const buildSubcommand = (recipe: SubcommandRecipe) =>
    CommandApi.make(recipe.name, configOf(recipe.options), () => Effect.void)

  const buildCommand = (recipe: CommandRecipe) => {
    const command = CommandApi.make(recipe.name, configOf(recipe.options), () => Effect.void)
    const [first, second] = recipe.subcommands
    if (second === undefined) {
      return CommandApi.withSubcommands(command, [buildSubcommand(first)])
    }
    return CommandApi.withSubcommands(command, [buildSubcommand(first), buildSubcommand(second)])
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
    it.prop('∀eb_Emit_≡BuildRoundTrip', [commandRecipeArb, versionArb], ([recipe, version]) =>
      isDeepStrictEqual(
        JSON.parse(emitLLMSManifest(buildCommand(recipe), version)),
        manifestOf(recipe, version),
      ))
  })
}
