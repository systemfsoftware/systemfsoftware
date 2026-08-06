import * as Either from 'effect/Either'
import * as Match from 'effect/Match'
import * as Option from 'effect/Option'
import * as S from 'effect/Schema'
import { LintableExtension } from '../edit-command.schema.js'
import type { ToolName } from '../edit-command.schema.js'

// Lockfile basename -> install command. The detected package manager is used ONLY to
// word the remediation hint; nothing is ever executed with it.
const LOCKFILE_INSTALL_COMMANDS: ReadonlyMap<string, string> = new Map([
  ['pnpm-lock.yaml', 'pnpm add -D oxlint'],
  ['package-lock.json', 'npm install -D oxlint'],
  ['yarn.lock', 'yarn add -D oxlint'],
  ['bun.lockb', 'bun add -d oxlint'],
  ['bun.lock', 'bun add -d oxlint'],
])

const NO_LOCKFILE_HINT = 'install oxlint as a dev dependency of this project'

const installHintFor = (lockfile: Option.Option<string>): string =>
  Option.match(lockfile, {
    onNone: () => NO_LOCKFILE_HINT,
    onSome: (name) => LOCKFILE_INSTALL_COMMANDS.get(name) ?? NO_LOCKFILE_HINT,
  })

export interface LintFacts {
  readonly toolName: ToolName
  readonly resolvedPath: string
  readonly extension: string
  readonly exists: boolean
  readonly firstLine: Option.Option<string>
  readonly configPath: Option.Option<string>
  readonly oxlintBinary: Option.Option<string>
  readonly lockfile: Option.Option<string>
}

const LintPlanTypeId: unique symbol = Symbol.for('@systemfsoftware/oxlint-guard/LintPlan')
type LintPlanTypeId = typeof LintPlanTypeId

export class Skip extends S.TaggedClass<Skip>()('Skip', {
  reason: S.String,
}) {
  readonly [LintPlanTypeId]: LintPlanTypeId = LintPlanTypeId
}

export class RunDeno extends S.TaggedClass<RunDeno>()('RunDeno', {
  filePath: S.String,
}) {
  readonly [LintPlanTypeId]: LintPlanTypeId = LintPlanTypeId
}

export class RunOxlint extends S.TaggedClass<RunOxlint>()('RunOxlint', {
  filePath: S.String,
  configPath: S.String,
  oxlintBinary: S.String,
}) {
  readonly [LintPlanTypeId]: LintPlanTypeId = LintPlanTypeId
}

export const LintPlan = S.Union(Skip, RunDeno, RunOxlint)
export type LintPlan = S.Schema.Type<typeof LintPlan>

const LintFailureTypeId: unique symbol = Symbol.for('@systemfsoftware/oxlint-guard/LintFailure')
type LintFailureTypeId = typeof LintFailureTypeId

export class NoOxlintConfig extends S.TaggedError<NoOxlintConfig>()('NoOxlintConfig', {
  installHint: S.String,
}) {
  readonly [LintFailureTypeId]: LintFailureTypeId = LintFailureTypeId
}

export class NoOxlintBinary extends S.TaggedError<NoOxlintBinary>()('NoOxlintBinary', {
  installHint: S.String,
}) {
  readonly [LintFailureTypeId]: LintFailureTypeId = LintFailureTypeId
}

export const LintFailure = S.Union(NoOxlintConfig, NoOxlintBinary)
export type LintFailure = S.Schema.Type<typeof LintFailure>

export type LintPlanDecision = Either.Either<LintPlan, LintFailure>

const isLintableExtension = (extension: string): boolean => S.is(LintableExtension)(extension.toLowerCase())

const isDenoShebang = (firstLine: Option.Option<string>): boolean =>
  Option.exists(firstLine, (line) => /^#!.*\bdeno\b/.test(line))

export const decideLintPlan = (
  facts: LintFacts,
): Either.Either<LintPlan, NoOxlintConfig | NoOxlintBinary> =>
  Match.value(facts).pipe(
    Match.when({ exists: false }, () => Either.right(new Skip({ reason: 'file-missing' }))),
    Match.when(
      (facts) => !isLintableExtension(facts.extension),
      () => Either.right(new Skip({ reason: 'not-lintable-extension' })),
    ),
    Match.when((facts) => isDenoShebang(facts.firstLine), (facts) =>
      Either.right(new RunDeno({ filePath: facts.resolvedPath }))),
    Match.when(
      (
        facts,
      ): facts is LintFacts & {
        readonly configPath: Option.Some<string>
        readonly oxlintBinary: Option.Some<string>
      } =>
        Option.isSome(facts.configPath) && Option.isSome(facts.oxlintBinary),
      (facts) =>
        Either.right(
          new RunOxlint({
            filePath: facts.resolvedPath,
            configPath: facts.configPath.value,
            oxlintBinary: facts.oxlintBinary.value,
          }),
        ),
    ),
    Match.when(
      (facts): facts is LintFacts & { readonly configPath: Option.None<string> } => Option.isNone(facts.configPath),
      (facts) => Either.left(new NoOxlintConfig({ installHint: installHintFor(facts.lockfile) })),
    ),
    Match.orElse((facts) => Either.left(new NoOxlintBinary({ installHint: installHintFor(facts.lockfile) }))),
  )
