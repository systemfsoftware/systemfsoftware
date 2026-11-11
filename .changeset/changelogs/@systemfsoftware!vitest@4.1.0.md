# @systemfsoftware/vitest@4.1.0

Hold the oxlint toolchain at ~1.89.0 (was ~1.93.0). The `oxlint-config-*` packages' oxlint peer range moves to ~1.89.0, and the oxlint-plugin packages' oxlint and @oxlint/plugins dependency range moves to ~1.89.0. Rules and presets are unchanged.

Adds @systemfsoftware/vitest/property-defaults, a setup file that sets the default run count of direct Arbitrary.checkEffect and Arbitrary.sampleEffect calls: 30 under STRYKER_MUTATOR_WORKER, 1000 when CI is set to any value other than false or 0 (and no AGENT), otherwise 100. A runs option passed explicitly still wins. Property tests (it.prop) take the same counts when a run provides no budget.

@systemfsoftware/vitest/property-defaults no longer throws "process is not defined" when the shared config loads it in a browser project; there it uses the local run count.
