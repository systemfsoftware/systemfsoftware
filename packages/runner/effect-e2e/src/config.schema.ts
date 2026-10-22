import { Schema } from 'effect'
import { EngineSpec } from './engine.schema.js'

export class ConfigInvalid extends Schema.TaggedError<ConfigInvalid>()('ConfigInvalid', {
  message: Schema.String,
}) {}

const AppConfig = Schema.Struct({
  url: Schema.String,
  identity: Schema.String,
})

const TargetConfig = Schema.Struct({
  name: Schema.String,
  engine: EngineSpec,
  app: AppConfig,
})

const ModelConfig = Schema.Struct({
  gateway: Schema.Literals(['openrouter', 'openai-compatible', 'none']),
  model: Schema.optional(Schema.String),
  apiKeyEnv: Schema.optional(Schema.String),
  baseURL: Schema.optional(Schema.String),
})

const AgentConfig = Schema.Struct({
  model: ModelConfig,
  system: Schema.optional(Schema.String),
  context: Schema.optional(Schema.String),
  maxSteps: Schema.optional(Schema.Finite),
  maxModelCalls: Schema.optional(Schema.Finite),
})

const AgentsConfig = Schema.Struct({
  default: AgentConfig,
})

export const E2eConfig = Schema.Struct({
  projectId: Schema.String,
  targets: Schema.Array(TargetConfig),
  tests: Schema.optional(Schema.Array(Schema.String)),
  agents: Schema.optional(AgentsConfig),
  timeout: Schema.optional(Schema.Finite),
})

export type E2eConfig = typeof E2eConfig.Type
