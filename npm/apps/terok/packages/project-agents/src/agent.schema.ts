import { Option, Schema as S } from 'effect'

export const AgentName = S.NonEmptyString.pipe(
  S.pattern(/^[a-z0-9][a-z0-9_-]*$/),
  S.brand('AgentName'),
)
export type AgentName = S.Schema.Type<typeof AgentName>

export const AgentLabel = S.NonEmptyString.pipe(S.brand('AgentLabel'))
export type AgentLabel = S.Schema.Type<typeof AgentLabel>

export class Agent extends S.TaggedClass<Agent>()('Agent', {}) {}

export class Tool extends S.TaggedClass<Tool>()('Tool', {}) {}

export class Provider extends S.TaggedClass<Provider>()('Provider', {}) {}

export const AgentKind = S.Union(Agent, Tool, Provider)
export type AgentKind = S.Schema.Type<typeof AgentKind>

export const RosterEntry = S.Struct({
  name: AgentName,
  kind: AgentKind,
  label: S.optionalWith(S.OptionFromSelf(AgentLabel), { default: () => Option.none() }),
  authProviderLabel: S.optionalWith(S.OptionFromSelf(AgentLabel), { default: () => Option.none() }),
  install: S.Boolean,
  dependsOn: S.optionalWith(S.Array(AgentName), { default: () => [] }),
})
export type RosterEntry = S.Schema.Type<typeof RosterEntry>
