/**
 * @internal Where a rerun command runs and what it names. With a package name the command is
 * `pnpm --filter <pkg> exec vitest run`, which pnpm runs in the package directory, so the file and any config are
 * written relative to that directory and a config Vitest finds there unaided is left out. Without one the command is
 * `vitest run` from the workspace root (else the project root), and the loaded config is always named.
 */

/** @internal */
export interface RerunTarget {
  readonly package: string
  readonly file: string
  readonly project: string
  readonly config: string
}

/** @internal */
export interface RerunFacts {
  readonly package: string
  readonly filepath: string
  readonly projectRelativeFile: string
  readonly project: string
  readonly packageRoot: string | undefined
  readonly workspaceRoot: string | undefined
  readonly configFile: string | undefined
}

const SEPARATOR = '/'

const DEFAULT_CONFIG_NAME = /^vite(?:st)?\.config\.[cm]?[jt]s$/u

const segmentsOf = (path: string): ReadonlyArray<string> =>
  path.replaceAll('\\', SEPARATOR).split(SEPARATOR).filter((segment) => segment.length > 0)

const sharedLength = (from: ReadonlyArray<string>, to: ReadonlyArray<string>): number => {
  const firstDifference = from.findIndex((segment, index) => to[index] !== segment)
  return firstDifference === -1 ? Math.min(from.length, to.length) : Math.min(firstDifference, to.length)
}

const relativePath = (from: string, to: string): string => {
  const base = segmentsOf(from)
  const target = segmentsOf(to)
  const shared = sharedLength(base, target)
  return [...base.slice(shared).map(() => '..'), ...target.slice(shared)].join(SEPARATOR)
}

const directoryOf = (path: string): string => segmentsOf(path).slice(0, -1).join(SEPARATOR)

const fileNameOf = (path: string): string => segmentsOf(path).at(-1) ?? ''

const isIn = (directory: string, path: string): boolean => directoryOf(path) === segmentsOf(directory).join(SEPARATOR)

const isDefaultConfigIn = (directory: string, configFile: string): boolean =>
  [isIn(directory, configFile), DEFAULT_CONFIG_NAME.test(fileNameOf(configFile))].every(Boolean)

const projectRootOf = (facts: RerunFacts): string =>
  facts.filepath.slice(0, Math.max(0, facts.filepath.length - facts.projectRelativeFile.length - 1))

const filteredBase = (facts: RerunFacts): string => facts.packageRoot ?? projectRootOf(facts)

const directBase = (facts: RerunFacts): string => facts.workspaceRoot ?? projectRootOf(facts)

const filteredConfig = (base: string, configFile: string): string =>
  isDefaultConfigIn(base, configFile) ? '' : relativePath(base, configFile)

const knownConfigOf = (facts: RerunFacts, base: string, configFile: string): string =>
  facts.package.length > 0 ? filteredConfig(base, configFile) : relativePath(base, configFile)

const configOf = (facts: RerunFacts, base: string): string =>
  facts.configFile === undefined ? '' : knownConfigOf(facts, base, facts.configFile)

const baseOf = (facts: RerunFacts): string => facts.package.length > 0 ? filteredBase(facts) : directBase(facts)

const knowsItsPath = (facts: RerunFacts): boolean =>
  [facts.filepath.length > 0, facts.filepath.endsWith(facts.projectRelativeFile)].every(Boolean)

const located = (facts: RerunFacts): RerunTarget => {
  const base = baseOf(facts)
  return {
    package: facts.package,
    file: relativePath(base, facts.filepath),
    project: facts.project,
    config: configOf(facts, base),
  }
}

const unlocated = (facts: RerunFacts): RerunTarget => ({
  package: facts.package,
  file: facts.projectRelativeFile,
  project: facts.project,
  config: '',
})

/** @internal */
export const rerunTargetOf = (facts: RerunFacts): RerunTarget => knowsItsPath(facts) ? located(facts) : unlocated(facts)
