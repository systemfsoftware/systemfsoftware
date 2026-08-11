import { Schema as S } from 'effect'

export const AuthMethod = S.Literal('oauth', 'device-code', 'api-key')
export type AuthMethod = S.Schema.Type<typeof AuthMethod>

export const AuthEntryName = S.String.pipe(S.brand('AuthEntryName'))
export type AuthEntryName = S.Schema.Type<typeof AuthEntryName>

export const LlmProvider = S.String.pipe(S.brand('LlmProvider'))
export type LlmProvider = S.Schema.Type<typeof LlmProvider>

export const ProviderName = S.Union(AuthEntryName, LlmProvider)
export type ProviderName = S.Schema.Type<typeof ProviderName>

export const AuthEntry = S.Struct({
  name: AuthEntryName,
  label: S.String,
  llmProvider: LlmProvider,
  methods: S.Array(AuthMethod),
})
export type AuthEntry = S.Schema.Type<typeof AuthEntry>

export const AuthRoster = S.Array(AuthEntry)
export type AuthRoster = S.Schema.Type<typeof AuthRoster>

export class VaultReadable extends S.TaggedClass<VaultReadable>()('VaultReadable', {
  authenticatedProviders: S.Array(LlmProvider),
}) {}

export class VaultLocked extends S.TaggedClass<VaultLocked>()('VaultLocked', {
  reason: S.String,
}) {}

export class VaultUnprovisioned extends S.TaggedClass<VaultUnprovisioned>()('VaultUnprovisioned', {}) {}

export const VaultState = S.Union(VaultReadable, VaultLocked, VaultUnprovisioned)
export type VaultState = S.Schema.Type<typeof VaultState>
