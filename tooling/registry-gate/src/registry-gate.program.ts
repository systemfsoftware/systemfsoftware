import { Config, Console, Effect, Match, Redacted, Ref, Schema } from 'effect'
import * as FileSystem from 'effect/FileSystem'
import * as Path from 'effect/Path'
import { AppTokenMinter } from './app-token-minter.service.js'
import { CanaryManifest, canaryName, canaryVersionOf, InstalledManifest, RootManifest, RunId } from './Canary.schema.js'
import type { CleanupPlan, PackageVersions } from './CleanupPlan.schema.js'
import { type GateOutcome, Inconclusive } from './GateOutcome.schema.js'
import {
  CanaryDeleted,
  CanaryKept,
  type CleanupRecord,
  type GateReport,
  type InstallAttempt,
  NothingToDelete,
  outcomeLineOf,
  summaryOf,
  TokenMinted,
  type TokenRecord,
  TokenUnminted,
} from './GateReport.schema.js'
import { type InstallVerdict, type SettledInstall, Unsettled } from './InstallVerdict.schema.js'
import { JudgeInstall, judgeInstall } from './judge-install.workflow.js'
import { PackagesApi } from './packages-api.service.js'
import { PlanCleanup, planCleanup } from './plan-cleanup.workflow.js'
import { Pnpm } from './pnpm.service.js'
import { GateUnsettled, PackagesApiFailed, PublishFailed } from './RegistryGateError.schema.js'
import { SelectOutcome, selectOutcome } from './select-outcome.workflow.js'

interface GateSettings {
  readonly runId: RunId
  readonly workspace: string
  readonly summaryFile: string
  readonly outputFile: string
  readonly path: string
  readonly home: string
  readonly githubToken: Redacted.Redacted<string>
}

const gateSettings: Config.Config<GateSettings> = Config.all({
  runId: Config.schema(RunId, 'GITHUB_RUN_ID'),
  workspace: Config.NonEmptyString('GITHUB_WORKSPACE'),
  summaryFile: Config.NonEmptyString('GITHUB_STEP_SUMMARY'),
  outputFile: Config.NonEmptyString('GITHUB_OUTPUT'),
  path: Config.NonEmptyString('PATH'),
  home: Config.NonEmptyString('HOME'),
  githubToken: Config.schema(Schema.Redacted(Schema.NonEmptyString), 'GITHUB_TOKEN'),
})

interface Draft {
  readonly visibility: string
  readonly token: TokenRecord
  readonly attempts: ReadonlyArray<InstallAttempt>
  readonly installed: string
}

interface Run {
  readonly settings: GateSettings
  readonly version: string
  readonly packageManager: string
  readonly draft: Ref.Ref<Draft>
}

const registryHost = 'npm.pkg.github.com'
const scopeLine = `@systemfsoftware:registry=https://${registryHost}`
const authFileOf = (variable: string): string => `${scopeLine}\n//${registryHost}/:_authToken=\${${variable}}\n`
const canaryFiles = ['index.js', 'README.md', 'LICENSE']

const childEnvOf = (settings: GateSettings, variable: string, token: Redacted.Redacted<string>) => ({
  PATH: settings.path,
  HOME: settings.home,
  CI: 'true',
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
  [variable]: Redacted.value(token),
})

const readJson = <S extends Schema.Top & { readonly DecodingServices: never }>(file: string, schema: S) =>
  Effect.flatMap(
    Effect.flatMap(FileSystem.FileSystem, (fs) => fs.readFileString(file)),
    Schema.decodeUnknownEffect(Schema.fromJsonString(schema)),
  )

const publishExit = (exitCode: number): Effect.Effect<void, PublishFailed> =>
  Match.value(exitCode).pipe(
    Match.when(0, () => Effect.void),
    Match.orElse(() => Effect.fail(new PublishFailed({ detail: `pnpm publish exited ${exitCode}` }))),
  )

const publishCanary = (run: Run) =>
  Effect.scoped(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const source = path.join(run.settings.workspace, '.github', 'registry-gate', 'canary')
      const packageDir = yield* fs.makeTempDirectoryScoped({ prefix: 'registry-gate-publish-' })
      const authDir = yield* fs.makeTempDirectoryScoped({ prefix: 'registry-gate-auth-' })
      const manifest = yield* readJson(path.join(source, 'package.json'), CanaryManifest)
      yield* Effect.forEach(
        canaryFiles,
        (file) => fs.copyFile(path.join(source, file), path.join(packageDir, file)),
        { discard: true },
      )
      yield* fs.writeFileString(
        path.join(packageDir, 'package.json'),
        `${JSON.stringify({ ...manifest, version: run.version, packageManager: run.packageManager }, null, 2)}\n`,
      )
      const authFile = path.join(authDir, 'npmrc')
      yield* fs.writeFileString(authFile, authFileOf('GITHUB_TOKEN'))
      const published = yield* (yield* Pnpm).run({
        args: ['publish', '--no-git-checks', '--tag', 'gate', '--npmrc-auth-file', authFile],
        cwd: packageDir,
        env: childEnvOf(run.settings, 'GITHUB_TOKEN', run.settings.githubToken),
      })
      yield* Console.log(published.output)
      yield* publishExit(published.exitCode)
    }),
  )

const recordInstalled = (draft: Ref.Ref<Draft>, verdict: InstallVerdict): Effect.Effect<void> =>
  Match.value(verdict).pipe(
    Match.tag(
      'Installed',
      (installed) =>
        Ref.update(draft, (current) => ({ ...current, installed: `${installed.name}@${installed.version}` })),
    ),
    Match.orElse(() => Effect.void),
  )

const installOnce = (run: Run, token: Redacted.Redacted<string>, attempt: 1 | 2) =>
  Effect.scoped(
    Effect.gen(function*() {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const projectDir = yield* fs.makeTempDirectoryScoped({ prefix: 'registry-gate-install-' })
      const authDir = yield* fs.makeTempDirectoryScoped({ prefix: 'registry-gate-auth-' })
      yield* fs.writeFileString(
        path.join(projectDir, 'package.json'),
        `${
          JSON.stringify({ name: 'registry-gate-install', private: true, packageManager: run.packageManager }, null, 2)
        }\n`,
      )
      yield* fs.writeFileString(path.join(projectDir, '.npmrc'), `${scopeLine}\n`)
      const authFile = path.join(authDir, 'npmrc')
      yield* fs.writeFileString(authFile, authFileOf('NODE_AUTH_TOKEN'))
      const added = yield* (yield* Pnpm).run({
        args: ['add', `${canaryName}@${run.version}`, '--npmrc-auth-file', authFile],
        cwd: projectDir,
        env: childEnvOf(run.settings, 'NODE_AUTH_TOKEN', token),
      })
      yield* Console.log(added.output)
      yield* Ref.update(
        run.draft,
        (current) => ({ ...current, attempts: [...current.attempts, { attempt, exitCode: added.exitCode }] }),
      )
      const installed = yield* Effect.option(
        readJson(path.join(projectDir, 'node_modules', canaryName, 'package.json'), InstalledManifest),
      )
      const verdict = yield* Effect.fromResult(
        judgeInstall(
          new JudgeInstall({
            attempt,
            exitCode: added.exitCode,
            output: added.output,
            installed,
            expectedName: canaryName,
            expectedVersion: run.version,
          }),
        ),
      )
      yield* recordInstalled(run.draft, verdict)
      return verdict
    }),
  )

const finalVerdictOf = (verdict: InstallVerdict): SettledInstall =>
  Match.value(verdict).pipe(
    Match.tag('RetryInstall', (retry) => new Unsettled({ reason: retry.detail })),
    Match.orElse((settled) => settled),
  )

const installUntilSettled = (run: Run, token: Redacted.Redacted<string>) =>
  Effect.flatMap(installOnce(run, token, 1), (first) =>
    Match.value(first).pipe(
      Match.tag('RetryInstall', () => Effect.map(installOnce(run, token, 2), finalVerdictOf)),
      Match.orElse((settled) => Effect.succeed<SettledInstall>(settled)),
    ))

const requireListed = (versions: PackageVersions, version: string): Effect.Effect<void, PackagesApiFailed> =>
  Match.value(versions.some((listed) => listed.name === version)).pipe(
    Match.when(true, () => Effect.void),
    Match.orElse(() =>
      Effect.fail(new PackagesApiFailed({ detail: `version ${version} is not listed after it was published` }))
    ),
  )

const decideOutcome = (run: Run) =>
  Effect.gen(function*() {
    yield* publishCanary(run)
    const api = yield* PackagesApi
    const visibility = yield* api.visibility
    yield* Ref.update(run.draft, (current) => ({ ...current, visibility }))
    yield* requireListed(yield* api.versions, run.version)
    const minted = yield* (yield* AppTokenMinter).mint.pipe(
      Effect.tapError((failure) =>
        Ref.update(run.draft, (current) => ({ ...current, token: new TokenUnminted({ reason: failure.message }) }))
      ),
    )
    yield* Ref.update(run.draft, (current) => ({
      ...current,
      token: new TokenMinted({
        permissions: minted.permissions,
        expiresAt: minted.expiresAt,
        repositorySelection: minted.repositorySelection,
      }),
    }))
    const verdict = yield* installUntilSettled(run, minted.token)
    return yield* Effect.fromResult(selectOutcome(new SelectOutcome({ verdict, visibility })))
  }).pipe(Effect.catch((failure) => Effect.succeed<GateOutcome>(new Inconclusive({ reason: failure.message }))))

const confirmed = (deleted: string) => (gone: boolean): CleanupRecord =>
  Match.value(gone).pipe(
    Match.when(true, () => new CanaryDeleted({ deleted })),
    Match.orElse(() => new CanaryKept({ reason: `${deleted} is still listed after the delete` })),
  )

const executeCleanup = (
  api: PackagesApi['Service'],
  plan: CleanupPlan,
): Effect.Effect<CleanupRecord, PackagesApiFailed> =>
  Match.value(plan).pipe(
    Match.tag('DeleteVersion', (deletion) =>
      api.deleteVersion(deletion.id).pipe(
        Effect.andThen(api.versionGone(deletion.id)),
        Effect.map(confirmed(`version id ${deletion.id}`)),
      )),
    Match.tag('DeletePackage', () =>
      api.deletePackage.pipe(
        Effect.andThen(api.packageGone),
        Effect.map(confirmed('the package, whose only version was the canary')),
      )),
    Match.tag('NothingPublished', () => Effect.succeed<CleanupRecord>(new NothingToDelete({}))),
    Match.exhaustive,
  )

const cleanUp = (version: string) =>
  Effect.gen(function*() {
    const api = yield* PackagesApi
    const versions = yield* api.versions
    const plan = yield* Effect.fromResult(planCleanup(new PlanCleanup({ version, versions })))
    return yield* executeCleanup(api, plan)
  }).pipe(
    Effect.catchTag('PackagesApiFailed', (failure) =>
      Effect.succeed<CleanupRecord>(new CanaryKept({ reason: failure.message }))),
  )

const outcomeSettles = (outcome: GateOutcome): boolean =>
  Match.value(outcome).pipe(
    Match.tag('Inconclusive', () => false),
    Match.orElse(() => true),
  )

const cleanupSettles = (cleanup: CleanupRecord): boolean =>
  Match.value(cleanup).pipe(
    Match.tag('CanaryKept', () => false),
    Match.orElse(() => true),
  )

const exitFor = (report: GateReport): Effect.Effect<void, GateUnsettled> =>
  Match.value([outcomeSettles(report.outcome), cleanupSettles(report.cleanup)].every(Boolean)).pipe(
    Match.when(true, () => Effect.void),
    Match.orElse(() =>
      Effect.fail(new GateUnsettled({ outcome: outcomeLineOf(report), cleanup: report.cleanup._tag }))
    ),
  )

export const registryGate = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const settings = yield* gateSettings
  const root = yield* readJson(path.join(settings.workspace, 'package.json'), RootManifest)
  const draft = yield* Ref.make<Draft>({
    visibility: 'unknown',
    token: new TokenUnminted({ reason: 'the gate stopped before the mint' }),
    attempts: [],
    installed: 'none',
  })
  const run: Run = { settings, version: canaryVersionOf(settings.runId), packageManager: root.packageManager, draft }
  const outcome = yield* decideOutcome(run)
  const cleanup = yield* cleanUp(run.version)
  const recorded = yield* Ref.get(draft)
  const report: GateReport = {
    canary: `${canaryName}@${run.version}`,
    visibility: recorded.visibility,
    token: recorded.token,
    attempts: recorded.attempts,
    installed: recorded.installed,
    outcome,
    cleanup,
  }
  yield* fs.writeFileString(settings.summaryFile, summaryOf(report), { flag: 'a' })
  yield* fs.writeFileString(settings.outputFile, `${outcomeLineOf(report)}\n`, { flag: 'a' })
  yield* Console.log(summaryOf(report))
  yield* exitFor(report)
})
