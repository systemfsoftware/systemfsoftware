// agent-plugins/ is outside the pnpm workspace, so the bare package name
// `@systemfsoftware/all` does not resolve from this directory. The dist is the
// preserved published consumption surface: oxlint runs `pnpm check:local`
// builds it before any gate, and its internal plugin imports resolve through
// the package's own node_modules links. `all` is already a complete
// OxlintConfig, so the canonical form is the direct default export.
//
// The type-aware pass runs with `--tsconfig tsconfig.oxlint.json`, which must
// not be named tsconfig.json: Deno auto-loads that name and would drop the
// built-in deno.ns library, breaking `deno check`.
//
// oxlint 1.77 tsgolint uses the tsconfig for module resolution only and never
// loads ambient Deno globals (official fix: `deno sync-types`, denoland#35894,
// absent from deno 2.9.4), so its `unsafe-*` reports on the Deno shell are
// false positives over code `deno task check` fully types. The plugin's own
// gate is `deno task lint:oxlint`; the repo pre-commit runs this same config
// via lint-staged's owning-config grouping.
import all from '../../packages/lint/oxlint/all/dist/index.mjs'

export default all
