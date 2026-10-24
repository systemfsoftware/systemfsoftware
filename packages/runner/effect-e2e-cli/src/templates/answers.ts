import * as Option from 'effect/Option'

export const ENGINES = ['web'] as const
export type Engine = (typeof ENGINES)[number]

export const GATEWAYS = ['openrouter', 'openai-compatible'] as const
export type Gateway = (typeof GATEWAYS)[number]

export interface GatewayDefaults {
  readonly apiKeyEnv: string
  readonly model: string
}

export const GATEWAY_DEFAULTS: { readonly [G in Gateway]: GatewayDefaults } = {
  openrouter: { apiKeyEnv: 'OPENROUTER_API_KEY', model: 'deepseek/deepseek-flash-latest' },
  'openai-compatible': { apiKeyEnv: 'OPENAI_API_KEY', model: 'gpt-4.1-mini' },
}

export interface SuiteAnswers {
  readonly engine: Engine
  readonly gateway: Gateway
  readonly model: Option.Option<string>
  readonly projectId: string
}

export const modelOf = (answers: SuiteAnswers): string =>
  Option.getOrElse(answers.model, () => GATEWAY_DEFAULTS[answers.gateway].model)
