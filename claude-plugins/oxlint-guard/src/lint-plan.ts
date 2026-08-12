import { err, ok, type Result } from './result.ts'
import { LINTABLE_EXTENSIONS, type ToolName } from './schemas.ts'

// Lockfile basename -> install command. The detected package manager is used ONLY to
// word the remediation hint; nothing is ever executed with it.
const LOCKFILE_INSTALL_COMMANDS: Record<string, string> = {
  'pnpm-lock.yaml': 'pnpm add -D oxlint',
  'package-lock.json': 'npm install -D oxlint',
  'yarn.lock': 'yarn add -D oxlint',
  'bun.lockb': 'bun add -d oxlint',
  'bun.lock': 'bun add -d oxlint',
}

const NO_LOCKFILE_HINT = 'install oxlint as a dev dependency of this project'

const installHintFor = (lockfile: string | undefined): string =>
  lockfile === undefined ? NO_LOCKFILE_HINT : LOCKFILE_INSTALL_COMMANDS[lockfile] ?? NO_LOCKFILE_HINT

export interface LintFacts {
  readonly toolName: ToolName
  readonly resolvedPath: string
  readonly extension: string
  readonly exists: boolean
  readonly firstLine: string | undefined
  readonly configPath: string | undefined
  readonly oxlintBinary: string | undefined
  readonly lockfile: string | undefined
  readonly denoConfig: string | undefined
}

export class Skip {
  readonly _tag: 'Skip' = 'Skip'
  readonly reason: string
  constructor(args: { readonly reason: string }) {
    this.reason = args.reason
  }
}

export class RunDeno {
  readonly _tag: 'RunDeno' = 'RunDeno'
  readonly filePath: string
  constructor(args: { readonly filePath: string }) {
    this.filePath = args.filePath
  }
}

export class RunOxlint {
  readonly _tag: 'RunOxlint' = 'RunOxlint'
  readonly filePath: string
  readonly configPath: string
  readonly oxlintBinary: string
  constructor(args: { readonly filePath: string; readonly configPath: string; readonly oxlintBinary: string }) {
    this.filePath = args.filePath
    this.configPath = args.configPath
    this.oxlintBinary = args.oxlintBinary
  }
}

export type LintPlan = Skip | RunDeno | RunOxlint

export class NoOxlintConfig {
  readonly _tag: 'NoOxlintConfig' = 'NoOxlintConfig'
  readonly installHint: string
  constructor(args: { readonly installHint: string }) {
    this.installHint = args.installHint
  }
}

export class NoOxlintBinary {
  readonly _tag: 'NoOxlintBinary' = 'NoOxlintBinary'
  readonly installHint: string
  constructor(args: { readonly installHint: string }) {
    this.installHint = args.installHint
  }
}

export type LintFailure = NoOxlintConfig | NoOxlintBinary

export type LintPlanDecision = Result<LintPlan, LintFailure>

const isLintableExtension = (extension: string): boolean =>
  LINTABLE_EXTENSIONS.some((lintable) => lintable === extension.toLowerCase())

const isDenoShebang = (firstLine: string | undefined): boolean =>
  firstLine !== undefined && /^#!.*\bdeno\b/.test(firstLine)

// The arm order is load-bearing: file-missing, then non-lintable extension, then
// deno shebang, then config+binary present, then deno workspace without an oxlint
// config, then config absent, then otherwise.
export const decideLintPlan = (
  facts: LintFacts,
): Result<LintPlan, NoOxlintConfig | NoOxlintBinary> => {
  if (facts.exists === false) {
    return ok(new Skip({ reason: 'file-missing' }))
  }
  if (!isLintableExtension(facts.extension)) {
    return ok(new Skip({ reason: 'not-lintable-extension' }))
  }
  if (isDenoShebang(facts.firstLine)) {
    return ok(new RunDeno({ filePath: facts.resolvedPath }))
  }
  if (facts.configPath !== undefined && facts.oxlintBinary !== undefined) {
    return ok(
      new RunOxlint({
        filePath: facts.resolvedPath,
        configPath: facts.configPath,
        oxlintBinary: facts.oxlintBinary,
      }),
    )
  }
  // A Deno workspace with no oxlint config is linted by Deno rather than reported
  // as a missing-config failure. Without this arm the guard hard-fails on every
  // edit inside a Deno project — including its own source — and a guard that
  // cries wolf on a whole tree is one nobody reads. Placed AFTER the oxlint arm,
  // so oxlint still wins wherever it is actually configured.
  if (facts.configPath === undefined && facts.denoConfig !== undefined) {
    return ok(new RunDeno({ filePath: facts.resolvedPath }))
  }
  if (facts.configPath === undefined) {
    return err(new NoOxlintConfig({ installHint: installHintFor(facts.lockfile) }))
  }
  return err(new NoOxlintBinary({ installHint: installHintFor(facts.lockfile) }))
}
