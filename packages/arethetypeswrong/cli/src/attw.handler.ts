import * as Args from '@effect/cli/Args'
import * as Command from '@effect/cli/Command'
import * as Options from '@effect/cli/Options'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'

import type { CliRequest } from './attw.executor.js'
import { runAttw } from './attw.executor.js'
import { CliFormat, CliProfile } from './problem-utils.kernel.js'

const packageJson = (): { version: string } => ({
  version: '1.1.1',
})

const formatOptions = (): Options.Options<typeof CliFormat[number]> =>
  Options.choice('format', CliFormat).pipe(
    Options.withAlias('f'),
    Options.withDefault('auto' as typeof CliFormat[number]),
  )

const profileOptions = (): Options.Options<typeof CliProfile[number]> =>
  Options.choice('profile', CliProfile).pipe(
    Options.withDefault('strict' as typeof CliProfile[number]),
  )

const ignoreRulesOptions = (): Options.Options<Option.Option<readonly string[]>> =>
  Options.optional(
    Options.repeated(Options.text('ignore-rules').pipe(Options.withAlias('ignore-rule'))),
  )

/**
 * `--definitely-typed` is tri-state: absent | `true` | a version-or-path string.
 * Commander parsed this with `new Option('--definitely-typed [version]')` and
 * `default(true)`. We model the decoded value as a tagged union and translate.
 */
const definitelyTypedOptions = (): Options.Options<Option.Option<string>> =>
  Options.optional(Options.text('definitely-typed')).pipe(
    Options.withDescription('Specify the version range of @types to use. Pass `false` to disable.'),
  )

const registryOptions = (): Options.Options<string> =>
  Options.text('registry').pipe(
    Options.withDescription(
      'URL of the npm registry to read packages from with --from-npm (default: https://registry.npmjs.org)',
    ),
    Options.withFallbackConfig(
      Config.string('registry').pipe(Config.withDefault('https://registry.npmjs.org')),
    ),
  )

const unwrap = <A>(opt: Option.Option<A>): A | undefined => Option.isSome(opt) ? opt.value : undefined

export const attwCommand = Command.make(
  'attw',
  {
    fileOrDirectory: Args.optional(Args.text({ name: 'file-directory-or-package-spec' })),
    pack: Options.boolean('pack').pipe(
      Options.withAlias('P'),
      Options.withDescription(
        'Run `npm pack` in the specified directory and delete the resulting .tgz file afterwards',
      ),
    ),
    fromNpm: Options.boolean('from-npm').pipe(
      Options.withAlias('p'),
      Options.withDescription('Read from the npm registry instead of a local file'),
    ),
    definitelyTyped: definitelyTypedOptions(),
    format: formatOptions(),
    quiet: Options.boolean('quiet').pipe(
      Options.withAlias('q'),
      Options.withDescription("Don't print anything to STDOUT (overrides all other options)"),
    ),
    entrypoints: Options.optional(Options.repeated(Options.text('entrypoints'))),
    includeEntrypoints: Options.optional(
      Options.repeated(Options.text('include-entrypoints')),
    ),
    excludeEntrypoints: Options.optional(
      Options.repeated(Options.text('exclude-entrypoints')),
    ),
    entrypointsLegacy: Options.boolean('entrypoints-legacy'),
    ignoreRules: ignoreRulesOptions(),
    profile: profileOptions(),
    summary: Options.boolean('no-summary', { ifPresent: false }),
    emoji: Options.boolean('no-emoji', { ifPresent: false }),
    color: Options.boolean('no-color', { ifPresent: false }),
    registry: registryOptions(),
  } as const,
  (config) =>
    Effect.gen(function*() {
      const input: CliRequest = {
        fileOrDirectory: unwrap(config.fileOrDirectory) ?? '.',
        pack: config.pack,
        fromNpm: config.fromNpm,
        definitelyTyped: unwrap(config.definitelyTyped),
        format: config.format,
        quiet: config.quiet,
        entrypoints: unwrap(config.entrypoints),
        includeEntrypoints: unwrap(config.includeEntrypoints),
        excludeEntrypoints: unwrap(config.excludeEntrypoints),
        entrypointsLegacy: config.entrypointsLegacy,
        ignoreRules: unwrap(config.ignoreRules),
        profile: config.profile,
        summary: config.summary,
        emoji: config.emoji,
        color: config.color,
        registry: config.registry,
      }
      const exitCode = yield* runAttw(input)
      yield* Effect.sync(() => {
        process.exitCode = exitCode
      })
      return exitCode
    }),
)
