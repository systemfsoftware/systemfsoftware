import { Match, Schema } from 'effect'
import { GateOutcome, outcomeIdOf } from './GateOutcome.schema.js'

const TokenRecordTypeId: unique symbol = Symbol.for('@systemfsoftware/registry-gate/TokenRecord')
type TokenRecordTypeId = typeof TokenRecordTypeId

const CleanupRecordTypeId: unique symbol = Symbol.for('@systemfsoftware/registry-gate/CleanupRecord')
type CleanupRecordTypeId = typeof CleanupRecordTypeId

export class TokenMinted extends Schema.TaggedClass<TokenMinted>()('TokenMinted', {
  permissions: Schema.Record(Schema.String, Schema.String),
  expiresAt: Schema.String,
  repositorySelection: Schema.String,
}) {
  readonly [TokenRecordTypeId] = TokenRecordTypeId
}

export class TokenUnminted extends Schema.TaggedClass<TokenUnminted>()('TokenUnminted', {
  reason: Schema.String,
}) {
  readonly [TokenRecordTypeId] = TokenRecordTypeId
}

export const TokenRecord = Schema.Union([TokenMinted, TokenUnminted])
export type TokenRecord = typeof TokenRecord.Type

export class CanaryDeleted extends Schema.TaggedClass<CanaryDeleted>()('CanaryDeleted', {
  deleted: Schema.String,
}) {
  readonly [CleanupRecordTypeId] = CleanupRecordTypeId
}

export class CanaryKept extends Schema.TaggedClass<CanaryKept>()('CanaryKept', {
  reason: Schema.String,
}) {
  readonly [CleanupRecordTypeId] = CleanupRecordTypeId
}

export class NothingToDelete extends Schema.TaggedClass<NothingToDelete>()('NothingToDelete', {}) {
  readonly [CleanupRecordTypeId] = CleanupRecordTypeId
}

export const CleanupRecord = Schema.Union([CanaryDeleted, CanaryKept, NothingToDelete])
export type CleanupRecord = typeof CleanupRecord.Type

export const InstallAttempt = Schema.Struct({ attempt: Schema.Int, exitCode: Schema.Int })
export type InstallAttempt = typeof InstallAttempt.Type

export const GateReport = Schema.Struct({
  canary: Schema.String,
  visibility: Schema.String,
  token: TokenRecord,
  attempts: Schema.Array(InstallAttempt),
  installed: Schema.String,
  outcome: GateOutcome,
  cleanup: CleanupRecord,
})
export type GateReport = typeof GateReport.Type

const cell = (text: string): string => text.replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|')

const row = (field: string, value: string): string => `| ${field} | ${cell(value)} |`

const permissionsOf = (permissions: Readonly<Record<string, string>>): string =>
  Match.value(Object.entries(permissions).length).pipe(
    Match.when(0, () => 'none'),
    Match.orElse(() =>
      Object.entries(permissions).map(([permission, access]) => `\`${permission}: ${access}\``).join(', ')
    ),
  )

const tokenRows = (token: TokenRecord): ReadonlyArray<string> =>
  Match.value(token).pipe(
    Match.tag('TokenMinted', (minted) => [
      row('Token permissions', permissionsOf(minted.permissions)),
      row('Token expiry', minted.expiresAt),
      row('Token repository selection', minted.repositorySelection),
    ]),
    Match.tag('TokenUnminted', (unminted) => [
      row('Token permissions', `not minted: ${unminted.reason}`),
      row('Token expiry', 'not minted'),
    ]),
    Match.exhaustive,
  )

const attemptsOf = (attempts: ReadonlyArray<InstallAttempt>): string =>
  Match.value(attempts.length).pipe(
    Match.when(0, () => 'not attempted'),
    Match.orElse(() => attempts.map((attempt) => `attempt ${attempt.attempt}: exit ${attempt.exitCode}`).join('; ')),
  )

const outcomeDetailOf = (outcome: GateOutcome): string =>
  Match.value(outcome).pipe(
    Match.tag('GithubPackages', (selected) => `github-packages: the App token installed ${selected.installed}`),
    Match.tag('OwnRegistry', (selected) => `own-registry: GitHub Packages answered HTTP ${selected.status}`),
    Match.tag('Inconclusive', (inconclusive) => `inconclusive, selects nothing: ${inconclusive.reason}`),
    Match.exhaustive,
  )

const cleanupOf = (report: GateReport): string =>
  Match.value(report.cleanup).pipe(
    Match.tag('CanaryDeleted', (deleted) => `deleted ${deleted.deleted}; confirmed gone`),
    Match.tag('CanaryKept', (kept) =>
      `not confirmed deleted; delete ${report.canary} by hand if it exists: ${kept.reason}`),
    Match.tag('NothingToDelete', () =>
      'nothing was published'),
    Match.exhaustive,
  )

export const outcomeLineOf = (report: GateReport): string => `outcome=${outcomeIdOf(report.outcome)}`

export const summaryOf = (report: GateReport): string =>
  [
    '## Registry gate',
    '',
    outcomeLineOf(report),
    '',
    '| Field | Value |',
    '| --- | --- |',
    row('Canary', report.canary),
    row('Canary visibility', report.visibility),
    ...tokenRows(report.token),
    row('Install exit codes', attemptsOf(report.attempts)),
    row('Installed', report.installed),
    row('Outcome', outcomeDetailOf(report.outcome)),
    row('Canary deletion', cleanupOf(report)),
    '',
  ].join('\n')
