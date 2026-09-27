import { Console, Context, Effect, Layer, Option } from 'effect'
import { CliOutput, Command } from 'effect/unstable/cli'
import type { HelpDoc } from 'effect/unstable/cli'
import { CommandSpecKey } from '../commands/annotation.js'
import type { CommandSpec } from '../commands/annotation.js'
import { silentConsole } from '../commands/output.js'
import { SystemfError, unknown } from '../contract/errors.js'
import { ERROR_MEANINGS, ErrorCode, EXIT_CODES } from '../contract/result.js'
import type {
  ErrorCodeInfo,
  ManifestArgument,
  ManifestCommand,
  ManifestData,
  ManifestExample,
  ManifestFlag,
  ResultType,
} from '../contract/result.js'
import { packageVersion } from '../package-version.js'

interface WalkNode {
  readonly name: string
  readonly description: string | undefined
  readonly annotations: Context.Context<never>
  readonly subcommands: ReadonlyArray<{
    readonly group: string | undefined
    readonly commands: ReadonlyArray<WalkNode>
  }>
}

interface ManifestWalk {
  readonly doc: HelpDoc.HelpDoc
  readonly commands: readonly ManifestCommand[]
  readonly missing: readonly string[]
}

interface Captured {
  doc: Option.Option<HelpDoc.HelpDoc>
}

const subcommandsOf = (node: WalkNode): readonly WalkNode[] => node.subcommands.flatMap((group) => group.commands)

const orEmpty = <A>(values: readonly A[] | undefined): readonly A[] => values ?? []

const resultTypesOf = (doc: HelpDoc.HelpDoc): readonly ResultType[] =>
  Option.getOrElse(
    Option.map(Context.getOption(doc.annotations, CommandSpecKey), (spec: CommandSpec) => spec.resultTypes),
    () => [],
  )

const descriptionOf = (description: Option.Option<string>): { readonly description?: string } => {
  const found = Option.getOrUndefined(description)
  return found === undefined ? {} : { description: found }
}

const flagDoc = (flag: HelpDoc.FlagDoc): ManifestFlag => ({
  name: flag.name,
  aliases: [...flag.aliases],
  type: flag.type,
  ...descriptionOf(flag.description),
  required: flag.required,
})

const flagsOf = (flags: readonly HelpDoc.FlagDoc[]): readonly ManifestFlag[] => flags.map(flagDoc)

const argumentDoc = (argument: HelpDoc.ArgDoc): ManifestArgument => ({
  name: argument.name,
  type: argument.type,
  ...descriptionOf(argument.description),
  required: argument.required,
  variadic: argument.variadic,
})

const exampleDoc = (example: HelpDoc.ExampleDoc): ManifestExample =>
  example.description === undefined
    ? { command: example.command }
    : { command: example.command, description: example.description }

const commandOf = (path: readonly string[], doc: HelpDoc.HelpDoc): ManifestCommand => ({
  path: [...path],
  description: doc.description,
  flags: flagsOf(doc.flags),
  arguments: orEmpty(doc.args).map(argumentDoc),
  examples: orEmpty(doc.examples).map(exampleDoc),
  resultTypes: resultTypesOf(doc),
})

const needsResultTypes = (doc: HelpDoc.HelpDoc): boolean =>
  doc.subcommands === undefined && resultTypesOf(doc).length === 0

const missingOf = (path: readonly string[], doc: HelpDoc.HelpDoc): readonly string[] =>
  needsResultTypes(doc) ? [path.join(' ')] : []

const captureFormatter = (captured: Captured): CliOutput.Formatter => ({
  formatHelpDoc: (doc) => {
    captured.doc = Option.some(doc)
    return ''
  },
  formatCliError: (error) => error.message,
  formatError: (error) => error.message,
  formatVersion: (name, version) => `${name} ${version}`,
  formatErrors: (errors) => errors.map((error) => error.message).join('\n'),
})

const captureServices = (captured: Captured): Layer.Layer<never> =>
  Layer.merge(CliOutput.layer(captureFormatter(captured)), Layer.succeed(Console.Console, silentConsole()))

const helpDocAt = <Name extends string, Input, ContextInput, E, R>(
  root: Command.Command<Name, Input, ContextInput, E, R>,
  path: readonly string[],
  version: string,
): Effect.Effect<HelpDoc.HelpDoc, SystemfError, Command.Environment | R> => {
  const captured: Captured = { doc: Option.none() }
  const program = Command.runWith(root, { version, renderErrors: false })([...path, '--help']).pipe(
    Effect.provide(captureServices(captured)),
    Effect.ignore,
  )
  return Effect.flatMap(
    program,
    () => Effect.fromOption(captured.doc, () => unknown(`no help document for ${path.join(' ')}`)),
  )
}

const walk = <Name extends string, Input, ContextInput, E, R>(
  root: Command.Command<Name, Input, ContextInput, E, R>,
  node: WalkNode,
  path: readonly string[],
  version: string,
): Effect.Effect<ManifestWalk, SystemfError, Command.Environment | R> =>
  Effect.gen(function*() {
    const doc = yield* helpDocAt(root, path.slice(1), version)
    const children = yield* Effect.forEach(
      subcommandsOf(node),
      (child) => walk(root, child, [...path, child.name], version),
      { concurrency: 1 },
    )
    return {
      doc,
      commands: [commandOf(path, doc), ...children.flatMap((child) => child.commands)],
      missing: [...missingOf(path, doc), ...children.flatMap((child) => child.missing)],
    }
  })

const errorCodes = (): readonly ErrorCodeInfo[] =>
  ErrorCode.literals.map((code) => ({ code, meaning: ERROR_MEANINGS[code] }))

export const manifestOf = <Name extends string, Input, ContextInput, E, R>(
  root: Command.Command<Name, Input, ContextInput, E, R>,
): Effect.Effect<ManifestData, SystemfError, Command.Environment | R> =>
  Effect.flatMap(
    packageVersion,
    (version) =>
      Effect.flatMap(walk(root, root, [root.name], version), (found) =>
        Effect.gen(function*() {
          yield* Effect.forEach(
            found.missing,
            (path) => Effect.fail(unknown(`command ${path} declares no result types`)),
            { concurrency: 1 },
          )
          return {
            name: root.name,
            version,
            description: found.doc.description,
            globalFlags: flagsOf(orEmpty(found.doc.globalFlags)),
            commands: found.commands,
            exitCodes: [...EXIT_CODES],
            errorCodes: errorCodes(),
          }
        })),
  )
