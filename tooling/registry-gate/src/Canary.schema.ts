import { Schema } from 'effect'

/** A GitHub Actions run id, as `GITHUB_RUN_ID` carries it: a positive decimal integer. */
export const RunId = Schema.String.pipe(Schema.check(Schema.isPattern(/^[1-9][0-9]*$/)))
export type RunId = typeof RunId.Type

export const CanaryName = Schema.Literal('@systemfsoftware/registry-gate-canary')
export type CanaryName = typeof CanaryName.Type

export const canaryName: CanaryName = '@systemfsoftware/registry-gate-canary'

export const CanaryPackageName = Schema.Literal('registry-gate-canary')
export type CanaryPackageName = typeof CanaryPackageName.Type

export const canaryPackageName: CanaryPackageName = 'registry-gate-canary'

/** The prerelease one run publishes. The run id makes it unique, so no run reuses a version another run deleted. */
export const canaryVersionOf = (runId: RunId): string => `0.0.1-gate.${runId}.0`

/** The manifest fields the canary ships; the gate rewrites `version` and adds `packageManager` before publishing. */
export const CanaryManifest = Schema.Struct({
  name: CanaryName,
  version: Schema.String,
  description: Schema.String,
  license: Schema.String,
  type: Schema.Literal('module'),
  main: Schema.String,
  files: Schema.Array(Schema.String),
  repository: Schema.Struct({ type: Schema.String, url: Schema.String, directory: Schema.String }),
  publishConfig: Schema.Struct({ registry: Schema.Literal('https://npm.pkg.github.com') }),
})
export type CanaryManifest = typeof CanaryManifest.Type

/** The one field the gate reads from the workspace root manifest: the pnpm version the scratch projects pin. */
export const RootManifest = Schema.Struct({
  packageManager: Schema.String.pipe(Schema.check(Schema.isPattern(/^pnpm@\d+\.\d+\.\d+$/))),
})
export type RootManifest = typeof RootManifest.Type

/** The manifest an installed package carries in `node_modules`. */
export const InstalledManifest = Schema.Struct({ name: Schema.String, version: Schema.String })
export type InstalledManifest = typeof InstalledManifest.Type
