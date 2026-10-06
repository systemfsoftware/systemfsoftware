declare module '#mcp-conformance/runner/index.js' {
  export type CheckStatus = 'SUCCESS' | 'FAILURE' | 'WARNING' | 'SKIPPED' | 'INFO'

  export interface ConformanceCheck {
    readonly id: string
    readonly name: string
    readonly description: string
    readonly status: CheckStatus
    readonly errorMessage?: string | undefined
  }

  export interface ServerRun {
    readonly checks: ReadonlyArray<ConformanceCheck>
    readonly resultDir?: string | undefined
    readonly scenarioDescription: string
    readonly skipped?: boolean | undefined
  }

  export function runServerConformanceTest(
    serverUrl: string,
    scenarioName: string,
    outputDir?: string,
    specVersion?: string,
    force?: boolean,
    timeout?: number,
  ): Promise<ServerRun>
}

declare module '#mcp-conformance/requirements.js' {
  export interface NotScoredEntry {
    readonly scenario: string
    readonly leg: 'client' | 'server'
    readonly reason: string
  }

  export interface RequirementSet {
    readonly revision: string
    readonly server: ReadonlyArray<string>
    readonly client: ReadonlyArray<string>
    readonly notScored: ReadonlyArray<NotScoredEntry>
  }

  export function loadRequirements(revision: string): RequirementSet
  export function scoredScenarios(requirements: RequirementSet, leg: 'client' | 'server'): ReadonlyArray<string>
  export function notScoredScenarios(
    requirements: RequirementSet,
    leg: 'client' | 'server',
  ): ReadonlyArray<NotScoredEntry>
  export function scenariosToRun(requirements: RequirementSet, leg: 'client' | 'server'): ReadonlyArray<string>
}

declare module '#mcp-conformance/scenarios/index.js' {
  export interface RegisteredScenario {
    readonly name: string
    readonly source: { readonly extensionId?: string | undefined }
  }

  export function listClientScenarios(): ReadonlyArray<string>
  export function getClientScenario(name: string): RegisteredScenario | undefined
}

declare module '#mcp-conformance/scenarios/server/json-schema-2020-12.js' {
  export const EXPECTED_TOOL_NAME: string
  export const JSON_SCHEMA_2020_12_FIXTURE: import('effect/ai').McpSchema.ToolJson
}

declare module '#mcp-conformance/scenarios/server/skills/helpers.js' {
  export const SKILLS_EXTENSION_ID: string
}

declare module '#mcp-conformance/types.js' {
  export const DRAFT_PROTOCOL_VERSION: string
}
