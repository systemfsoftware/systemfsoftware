import { Schema } from 'effect'

export const MintStage = Schema.Literals(['doppler', 'oidc', 'sign', 'mint'])
export type MintStage = typeof MintStage.Type

export class TokenMintFailed extends Schema.TaggedError<TokenMintFailed>()('TokenMintFailed', {
  stage: MintStage,
  detail: Schema.String,
}) {
  override get message(): string {
    return `the App installation token was not minted (${this.stage}): ${this.detail}`
  }
}

export class PublishFailed extends Schema.TaggedError<PublishFailed>()('PublishFailed', {
  detail: Schema.String,
}) {
  override get message(): string {
    return `the canary was not published: ${this.detail}`
  }
}

export class PackagesApiFailed extends Schema.TaggedError<PackagesApiFailed>()('PackagesApiFailed', {
  detail: Schema.String,
}) {
  override get message(): string {
    return `the GitHub packages API call failed: ${this.detail}`
  }
}

export class GateUnsettled extends Schema.TaggedError<GateUnsettled>()('GateUnsettled', {
  outcome: Schema.String,
  cleanup: Schema.String,
}) {
  override get message(): string {
    return `the registry gate did not settle cleanly: ${this.outcome}; canary cleanup: ${this.cleanup}`
  }
}
