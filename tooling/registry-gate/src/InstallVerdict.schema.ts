import { Schema } from 'effect'

const InstallVerdictTypeId: unique symbol = Symbol.for('@systemfsoftware/registry-gate/InstallVerdict')
type InstallVerdictTypeId = typeof InstallVerdictTypeId

/** The HTTP statuses that mean the registry refused the token: a rejection, not a fault. */
export const RejectionStatus = Schema.Literals([401, 403, 404])
export type RejectionStatus = typeof RejectionStatus.Type

/** The install exited 0 and `node_modules` holds the published canary. */
export class Installed extends Schema.TaggedClass<Installed>()('Installed', {
  name: Schema.String,
  version: Schema.String,
}) {
  readonly [InstallVerdictTypeId] = InstallVerdictTypeId
}

/** The registry answered the install with 401, 403 or 404. */
export class Rejected extends Schema.TaggedClass<Rejected>()('Rejected', {
  status: RejectionStatus,
}) {
  readonly [InstallVerdictTypeId] = InstallVerdictTypeId
}

/** The first attempt failed for a reason other than a rejection; the gate tries once more. */
export class RetryInstall extends Schema.TaggedClass<RetryInstall>()('RetryInstall', {
  detail: Schema.String,
}) {
  readonly [InstallVerdictTypeId] = InstallVerdictTypeId
}

/** The install settled nothing: neither the canary nor a rejection. */
export class Unsettled extends Schema.TaggedClass<Unsettled>()('Unsettled', {
  reason: Schema.String,
}) {
  readonly [InstallVerdictTypeId] = InstallVerdictTypeId
}

/** What one install attempt shows. */
export const InstallVerdict = Schema.Union([Installed, Rejected, RetryInstall, Unsettled])
export type InstallVerdict = typeof InstallVerdict.Type

/** The verdicts that end the install phase. */
export const SettledInstall = Schema.Union([Installed, Rejected, Unsettled])
export type SettledInstall = typeof SettledInstall.Type
