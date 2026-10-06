import { Option } from 'effect'

export type DiagramCommand = 'build' | 'check'

export interface CliOptions {
  readonly command: DiagramCommand
  readonly dir: string | undefined
}

const commandOf = (argv: ReadonlyArray<string>): DiagramCommand =>
  Option.match(Option.fromNullishOr(argv[0]), {
    onNone: () => 'build',
    onSome: (first) => first === 'check' ? 'check' : 'build',
  })

const inlineDirOf = (argv: ReadonlyArray<string>): string | undefined =>
  Option.getOrUndefined(
    Option.map(
      Option.fromNullishOr(argv.find((arg) => arg.startsWith('--dir='))),
      (arg) => arg.slice('--dir='.length),
    ),
  )

const spacedDirOf = (argv: ReadonlyArray<string>): string | undefined => {
  const index = argv.indexOf('--dir')
  return index === -1 ? undefined : argv[index + 1]
}

const dirOf = (argv: ReadonlyArray<string>): string | undefined => inlineDirOf(argv) ?? spacedDirOf(argv)

export const parseArgs = (argv: ReadonlyArray<string>): CliOptions => ({ command: commandOf(argv), dir: dirOf(argv) })
