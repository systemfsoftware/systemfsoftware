import { Option } from 'effect'

export interface CliOptions {
  readonly dir: string | undefined
  readonly check: boolean
}

const inlineValueOf = (argv: ReadonlyArray<string>): string | undefined =>
  Option.getOrUndefined(
    Option.map(
      Option.fromNullishOr(argv.find((arg) => arg.startsWith('--dir='))),
      (arg) => arg.slice('--dir='.length),
    ),
  )

const flagValueOf = (argv: ReadonlyArray<string>): string | undefined => {
  const index = argv.indexOf('--dir')
  return index === -1 ? undefined : argv[index + 1]
}

const dirOf = (argv: ReadonlyArray<string>): string | undefined => inlineValueOf(argv) ?? flagValueOf(argv)

export const parseArgs = (argv: ReadonlyArray<string>): CliOptions => ({
  dir: dirOf(argv),
  check: argv.includes('--check'),
})
