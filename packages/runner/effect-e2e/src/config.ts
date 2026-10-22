import { Effect, Option, Schema } from 'effect'
import { flow } from 'effect/Function'
import * as SchemaIssue from 'effect/SchemaIssue'
import { ConfigInvalid, E2eConfig } from './config.schema.js'

export const defaultTestGlobs: ReadonlyArray<string> = ['tests/**/*.e2e.ts']

const DEFAULT_KEY_ENV: Record<'openrouter' | 'openai-compatible' | 'none', string | undefined> = {
  openrouter: 'OPENROUTER_API_KEY',
  'openai-compatible': undefined,
  none: undefined,
}

const formatIssue = SchemaIssue.makeFormatterDefault()

export const decodeConfig = flow(
  Schema.decodeUnknownEffect(E2eConfig, { onExcessProperty: 'error' }),
  Effect.mapError((error) => new ConfigInvalid({ message: formatIssue(error.issue) })),
)

export const defineConfig = (config: E2eConfig): E2eConfig => config

export const testGlobsOf = (config: E2eConfig): ReadonlyArray<string> => config.tests ?? defaultTestGlobs

export const gatewayApiKeyEnv = (config: E2eConfig): string | undefined =>
  Option.getOrUndefined(
    Option.flatMap(Option.fromUndefinedOr(config.agents), (agents) =>
      Option.orElse(
        Option.fromUndefinedOr(agents.default.model.apiKeyEnv),
        () => Option.fromUndefinedOr(DEFAULT_KEY_ENV[agents.default.model.gateway]),
      )),
  )
