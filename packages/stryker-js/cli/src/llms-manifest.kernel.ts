import type * as Command from '@effect/cli/Command'
import { PluginKind } from '@stryker-mutator/api/plugin'
import { Option } from 'effect'

import { strykerPlugins } from '@systemfsoftware/stryker-js-mutation-run/reporters/stryker-plugins'

// =============================================================================
// U11 — the `--llms` command manifest (R13)
//
// `@effect/cli` has no manifest serializer, so the emitter is hand-built —
// but never from a list maintained alongside the CLI. Every field is read by
// walking the command's own descriptors: the instruction trees `Command.make`
// compiled from the option/arg records, i.e. the same values the parser
// matches against. An option's `Single` node carries its name, aliases,
// primitive type (kind, and the alternatives for a choice) and description; a
// `WithDefault` wrapper marks the option optional and carries its default.
// The framework keeps this tree internal (`Options.Options`, `Args.Args` and
// `Descriptor.Command` are opaque public types), so the walk narrows the
// runtime values with `_tag`-discriminated type predicates — never casts.
//
// The consequence is the anti-drift property: a newly added option appears in
// the manifest with no change to any code here, because the manifest is
// derived from the descriptors, not from a parallel list. The drift guard
// test proves it by constructing a command carrying an extra option and
// asserting the emitter picks it up.
//
// The one value the descriptors do not carry — the allowed reporter names —
// comes from the U9 reporter registry (pruned to the five survivors), never
// from a literal.
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
// Runtime narrowing: the descriptor shapes are framework-internal, so the
// walk reads them through `_tag`-discriminated type predicates.
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

// -----------------------------------------------------------------------------
// HelpDoc → text. Stored option descriptions are `Paragraph(Text(value))`;
// the other tags are handled so a richer description is never dropped.
// -----------------------------------------------------------------------------

function spanToText(span: unknown): string {
  if (typeof span === 'string') {
    return span
  }
  if (!isObject(span)) {
    return ''
  }
  const tag = span['_tag']
  if (tag === 'Concat') {
    return `${spanToText(span['left'])}${spanToText(span['right'])}`
  }
  const value = span['value']
  return typeof value === 'string' ? value : ''
}

function helpDocToText(doc: unknown): string {
  if (!isObject(doc)) {
    return ''
  }
  const tag = doc['_tag']
  switch (tag) {
    case 'Empty':
      return ''
    case 'Paragraph':
    case 'Header':
    case 'Error':
      return spanToText(doc['value'])
    case 'Sequence':
      return [helpDocToText(doc['left']), helpDocToText(doc['right'])].filter(Boolean).join('\n\n')
    case 'Enumeration':
      return Array.isArray(doc['elements'])
        ? doc['elements'].map((element) => helpDocToText(element)).join('\n')
        : ''
    case 'CodeBlock':
      return typeof doc['value'] === 'string' ? doc['value'] : ''
    case 'DescriptionList':
      return Array.isArray(doc['definitions'])
        ? doc['definitions']
          .map((row) => (Array.isArray(row) ? spanToText(row[0]) : ''))
          .filter(Boolean)
          .join(', ')
        : ''
    default:
      return ''
  }
}

// -----------------------------------------------------------------------------
// Primitive kinds and choice alternatives.
// -----------------------------------------------------------------------------

const PRIMITIVE_KIND: Readonly<Record<string, string>> = {
  Bool: 'boolean',
  Choice: 'choice',
  DateTime: 'date',
  Float: 'float',
  Integer: 'integer',
  Path: 'path',
  Redacted: 'redacted',
  Secret: 'secret',
  Text: 'text',
}

function kindOf(primitive: Record<string, unknown>): string {
  const tag = stringField(primitive, '_tag')
  return tag === undefined ? 'unknown' : PRIMITIVE_KIND[tag] ?? tag
}

function choiceValues(primitive: Record<string, unknown>): readonly string[] | undefined {
  const alternatives = primitive['alternatives']
  if (!Array.isArray(alternatives)) {
    return undefined
  }
  const values: string[] = []
  for (const pair of alternatives) {
    if (Array.isArray(pair) && typeof pair[0] === 'string') {
      values.push(pair[0])
    }
  }
  return values
}

/** The allowed reporter names, read from the U9 registry — the same list the plugin loader accepts. */
const REPORTER_NAMES: readonly string[] = strykerPlugins
  .filter((plugin) => plugin.kind === PluginKind.Reporter)
  .map((plugin) => plugin.name)

// -----------------------------------------------------------------------------
// The option walk. Instruction tags: `Single` (a declared option),
// `Map`/`Both`/`OrElse` (composition), `Variadic`/`KeyValueMap` (repetition),
// `WithDefault` (optional, with its fallback), `Empty`. The walk carries a
// context through composition nodes so each option reports its own
// required/default status; `WithDefault` is what `Options.optional` and
// `Options.boolean` compile to.
// -----------------------------------------------------------------------------

interface WalkContext {
  readonly hasDefault: boolean
  readonly defaultValue: unknown
}

function normalizeDefault(fallback: unknown): unknown {
  if (Option.isOption(fallback)) {
    return Option.match(fallback, {
      onNone: () => undefined,
      onSome: (value) => value,
    })
  }
  return fallback
}

function describeOptionSingle(node: Record<string, unknown>, ctx: WalkContext): LLMSManifestOption {
  const name = stringField(node, 'name') ?? ''
  const primitive = isObject(node['primitiveType']) ? node['primitiveType'] : {}
  const kind = kindOf(primitive)
  // `reporters` is a plain text option, so its allowed value set lives
  // nowhere in its descriptor — it is the registry, read at module load so
  // the manifest and the plugin loader cannot drift.
  const choices = name === 'reporters'
    ? REPORTER_NAMES
    : kind === 'choice'
    ? choiceValues(primitive)
    : undefined
  return {
    name,
    aliases: stringArrayField(node, 'aliases'),
    kind,
    required: !ctx.hasDefault,
    ...(ctx.hasDefault && ctx.defaultValue !== undefined ? { default: ctx.defaultValue } : {}),
    ...(choices !== undefined ? { choices } : {}),
    description: helpDocToText(node['description']),
  }
}

function walkOptions(instruction: unknown, ctx: WalkContext, out: LLMSManifestOption[]): void {
  if (!isObject(instruction)) {
    return
  }
  const tag = instruction['_tag']
  switch (tag) {
    case 'Empty':
      return
    case 'Single':
      out.push(describeOptionSingle(instruction, ctx))
      return
    case 'Map':
      walkOptions(instruction['options'], ctx, out)
      return
    case 'Both':
    case 'OrElse':
      walkOptions(instruction['left'], ctx, out)
      walkOptions(instruction['right'], ctx, out)
      return
    case 'Variadic':
    case 'KeyValueMap':
      walkOptions(instruction['argumentOption'], ctx, out)
      return
    case 'WithDefault':
      walkOptions(instruction['options'], {
        hasDefault: true,
        defaultValue: normalizeDefault(instruction['fallback']),
      }, out)
      return
    case 'WithFallback':
      walkOptions(instruction['options'], { hasDefault: true, defaultValue: undefined }, out)
      return
    default:
      // An instruction tag this emitter does not know cannot describe a
      // declared option; the drift guard test fails the day one appears.
      return
  }
}

// -----------------------------------------------------------------------------
// The positional-arg walk. Same tree shape as options, with the args' field
// names and no aliases.
// -----------------------------------------------------------------------------

function describeArgSingle(node: Record<string, unknown>, hasDefault: boolean): LLMSManifestArg {
  const primitive = isObject(node['primitiveType']) ? node['primitiveType'] : {}
  return {
    name: stringField(node, 'name') ?? '',
    kind: kindOf(primitive),
    required: !hasDefault,
    description: helpDocToText(node['description']),
  }
}

function walkArgs(instruction: unknown, hasDefault: boolean, out: LLMSManifestArg[]): void {
  if (!isObject(instruction)) {
    return
  }
  const tag = instruction['_tag']
  switch (tag) {
    case 'Empty':
      return
    case 'Single':
      out.push(describeArgSingle(instruction, hasDefault))
      return
    case 'Map':
      walkArgs(instruction['args'], hasDefault, out)
      return
    case 'Both':
      walkArgs(instruction['left'], hasDefault, out)
      walkArgs(instruction['right'], hasDefault, out)
      return
    case 'Variadic':
      walkArgs(instruction['argumentOption'], hasDefault, out)
      return
    case 'WithDefault':
      walkArgs(instruction['args'], true, out)
      return
    case 'WithFallbackConfig':
      walkArgs(instruction['args'], true, out)
      return
    default:
      return
  }
}

// -----------------------------------------------------------------------------
// The command walk. Descriptor tags: `Standard` (a declared command),
// `Map` (transformed, recurse), `Subcommands` (parent plus children).
// -----------------------------------------------------------------------------

function describeCommandNode(node: unknown): LLMSManifestCommand | undefined {
  if (!isObject(node)) {
    return undefined
  }
  const tag = node['_tag']
  switch (tag) {
    case 'Standard': {
      const options: LLMSManifestOption[] = []
      walkOptions(node['options'], { hasDefault: false, defaultValue: undefined }, options)
      const args: LLMSManifestArg[] = []
      walkArgs(node['args'], false, args)
      return {
        name: stringField(node, 'name') ?? '',
        description: helpDocToText(node['description']),
        options,
        args,
        subcommands: [],
      }
    }
    case 'Map':
      return describeCommandNode(node['command'])
    case 'Subcommands': {
      const parent = describeCommandNode(node['parent'])
      if (parent === undefined) {
        return undefined
      }
      const subcommands: LLMSManifestCommand[] = []
      if (Array.isArray(node['children'])) {
        for (const child of node['children']) {
          const described = describeCommandNode(child)
          if (described !== undefined) {
            subcommands.push(described)
          }
        }
      }
      return { ...parent, subcommands }
    }
    default:
      return undefined
  }
}

/**
 * Builds the manifest document for a command, walking its descriptor (the
 * same instruction trees the parser matches against). `version` is the tool
 * version, passed in so this module stays free of package state.
 */
export function buildLLMSManifest<Name extends string, R, E, A>(
  command: Command.Command<Name, R, E, A>,
  version: string,
): LLMSManifest {
  const root = describeCommandNode(command.descriptor) ?? {
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
export function emitLLMSManifest<Name extends string, R, E, A>(
  command: Command.Command<Name, R, E, A>,
  version: string,
): string {
  return JSON.stringify(buildLLMSManifest(command, version))
}
