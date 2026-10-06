export {
  type Addition,
  claimedFiles,
  differingBlobs,
  duplicateRecords,
  type Exports,
  type Family,
  type FamilyPackage,
  forkPaths,
  importedSupport,
  type InPlace,
  inPlaceClaims,
  inPlaceFiles,
  type InPlaceVerdict,
  type Json,
  judge,
  judgeInPlace,
  judgePort,
  type ListVerdict,
  packageDir,
  pinnedCommit,
  type Ported,
  type PortRegion,
  type PortVerdict,
  recordedButTracked,
  relativePath,
  reportedFiles,
  reportPaths,
  type Retired,
  type Selection,
  selectTests,
  strayClaims,
  SUBTREE_DIR,
  SUBTREE_SPLIT,
  trackedReports,
  unclaimed,
  unreportedFiles,
  upstreamDir,
  upstreamTestProject,
  type VitestReport,
} from './manifest.js'

export { Manifest } from './domain.schema.js'

export { checkFamily, type FamilyResult, type Member, runCheck, syncTestProjects } from './check.js'

export {
  FIXTURE_FAMILY,
  FIXTURE_FAMILY_PATH,
  FIXTURE_HELPER,
  FIXTURE_IN_PLACE_FAMILY,
  FIXTURE_IN_PLACE_MANIFEST,
  FIXTURE_IN_PLACE_PATH,
  FIXTURE_IN_PLACE_REPORT,
  FIXTURE_IN_PLACE_REPORT_JSON,
  FIXTURE_IN_PLACE_SUBTREE,
  FIXTURE_IN_PLACE_TEST,
  FIXTURE_IN_PLACE_TEST_B,
  FIXTURE_MESSAGES,
  FIXTURE_META_CLAIMS,
  FIXTURE_META_FEATURE,
  FIXTURE_META_LESS_REPORT_JSON,
  FIXTURE_META_REPORT_JSON,
  FIXTURE_META_SKIPPED_REPORT_JSON,
  FIXTURE_META_STRAY_REPORT_JSON,
  FIXTURE_PIN,
  FIXTURE_PORT_REGION,
  FIXTURE_PORTED,
  FIXTURE_PORTED_BLOB,
  FIXTURE_PORTED_UPSTREAM,
  FIXTURE_REFS,
  FIXTURE_RETIRED_TEST,
  FIXTURE_SUBTREE_TRAILERS,
  FIXTURE_TRACKED,
  FIXTURE_TREE,
  FIXTURE_UPSTREAM_TEST,
  fixtureManifest,
  type FixtureRepo,
  withFixtureRepo,
} from './fixture.js'

export { Git, GitLive, type GitRequest } from './git.js'
export { GitMemory, type GitRepo } from './git.memory.js'

export { pureCases, selftest } from './selftest.js'

export { parseJson, stringifyJson } from './json.js'

export { GuardError } from './guard-error.schema.js'
