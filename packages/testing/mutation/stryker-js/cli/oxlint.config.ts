import all from '@systemfsoftware/all'
import { defineConfig } from 'oxlint'

export default defineConfig({
  extends: [all],
  // Fixture projects are input data for the mutation contract tests, not
  // source — their JS calculator is intentionally untyped so the engine
  // has something to mutate. Ignoring the fixture directory reflects a
  // genuine fixture-data boundary, not a weakened check on source.
  ignorePatterns: [...(all.ignorePatterns ?? []), 'tests/__fixtures__/fixtures/**'],
})
