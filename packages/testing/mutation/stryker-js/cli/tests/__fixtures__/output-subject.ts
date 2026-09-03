// This fixture re-exports the public bindings under test because the
// tests-import-public-api rule forbids relative src imports in test files,
// so the suites import through here instead of reaching into src directly.
// It mirrors the node-platform.ts fixture precedent.
export {
  type FormatFlags,
  isColorEnabled,
  isProgressEnabled,
  type ModeInput,
  resolveMode,
  STREAM_SCHEMA_VERSION,
  TICK_INTERVAL_MS,
} from '../../src/Output.js'
