import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Argument from 'effect/unstable/cli/Argument'
import * as Command from 'effect/unstable/cli/Command'
import * as Flag from 'effect/unstable/cli/Flag'

import type { CliRequest } from './attw.executor.js'
import { runAttw } from './attw.executor.js'
import { CliFormat, CliProfile } from './problem-utils.kernel.js'

const packageJson = (): { version: string } => ({
  version: '1.1.1',
})

const formatOptions = (): Flag.Flag<typeof CliFormat[number]> =>
  Flag.choice('format', CliFormat).pipe(
    Flag.withAlias('f'),
    Flag.withDefault('auto' as typeof CliFormat[number]),
  )

const profileOptions = (): Flag.Flag<typeof CliProfile[number]> =>
  Flag.choice('profile', CliProfile).pipe(
    Flag.withDefault('strict' as typeof CliProfile[number]),
  )

const ignoreRulesOptions = (): Flag.Flag<Option.Option<readonly string[]>> =>
  Flag.optional(
    Flag.atLeast<string>(1)(Flag.string('ignore-rules').pipe(Flag.withAlias('ignore-rule'))),
  )

/**
 * `--definitely-typed` is tri-state: absent | `true` | a version-or-path string.
 * Commander parsed this with `new Option('--definitely-typed [version]')` and
 * `default(true)`. We model the decoded value as a tagged union and translate.
 */
const definitelyTypedOptions = (): Flag.Flag<Option.Option<string>> =>
  Flag.optional(Flag.string('definitely-typed')).pipe(
    Flag.withDescription('Specify the version range of @types to use. Pass `false` to disable.'),
  )

const registryOptions = (): Flag.Flag<string> =>
  Flag.string('registry').pipe(
    Flag.withDescription(
      'URL of the npm registry to read packages from with --from-npm (default: https://registry.npmjs.org)',
    ),
    Flag.withFallbackConfig(
      Config.string('registry').pipe(Config.withDefault('https://registry.npmjs.org')),
    ),
  )

const unwrap = <A>(opt: Option.Option<A>): A | undefined => Option.isSome(opt) ? opt.value : undefined

export const attwCommand = Command.make(
  'attw',
  {
    fileOrDirectory: Argument.optional(Argument.string('file-directory-or-package-spec')),
    pack: Flag.boolean('pack').pipe(
      Flag.withAlias('P'),
      Flag.withDescription(
        'Run `npm pack` in the specified directory and delete the resulting .tgz file afterwards',
      ),
    ),
    fromNpm: Flag.boolean('from-npm').pipe(
      Flag.withAlias('p'),
      Flag.withDescription('Read from the npm registry instead of a local file'),
    ),
    definitelyTyped: definitelyTypedOptions(),
    format: formatOptions(),
    quiet: Flag.boolean('quiet').pipe(
      Flag.withAlias('q'),
      Flag.withDescription("Don't print anything to STDOUT (overrides all other options)"),
    ),
    entrypoints: Flag.optional(Flag.atLeast<string>(1)(Flag.string('entrypoints'))),
    includeEntrypoints: Flag.optional(Flag.atLeast<string>(1)(Flag.string('include-entrypoints'))),
    excludeEntrypoints: Flag.optional(Flag.atLeast<string>(1)(Flag.string('exclude-entrypoints'))),
    entrypointsLegacy: Flag.boolean('entrypoints-legacy'),
    ignoreRules: ignoreRulesOptions(),
    profile: profileOptions(),
    summary: Flag.boolean('summary').pipe(Flag.withDefault(true)),
    emoji: Flag.boolean('emoji').pipe(Flag.withDefault(true)),
    color: Flag.boolean('color').pipe(Flag.withDefault(true)),
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
