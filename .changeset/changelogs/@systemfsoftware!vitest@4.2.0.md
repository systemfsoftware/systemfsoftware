# @systemfsoftware/vitest@4.2.0

Dev dependency bump (@types/node) only; the packed tarball is unchanged.

Judge every property file's constant-impostor vacuity at that file's own end under both isolate modes; a later property file in a shared module cache is no longer left unjudged.

Rebuilt with tsdown 0.23.7 against the updated dev dependencies: the bundled `dist/` files carry a different hashed runtime chunk name and comment markers, and the declared devDependency ranges move. The public API and runtime behaviour are unchanged.

Property budgets come from one table per tier (`replay`, `mutation`, `nightly`, `local`, `ci`), read through `PropertyConfig` from `PROPERTY_TIER`, `PROPERTY_RUNS`, `PROPERTY_SEED`, `CONFORMANCE_REPLAY`, `CI`, `AGENT`, `STRYKER_MUTATOR_WORKER` and the CI commit variables. `PROPERTY_RUNS` and `PROPERTY_SEED` apply over a property's own `runs` and `seed`. Off the local tier each property's seed is derived from the checked-out commit. `recordOfProperty` and `recordOfFile` take `settings`, so a test hands the runner its settings instead of setting the environment. The new `@systemfsoftware/vitest/vite` entry exports `propertyRunFacts()`, which publishes the commit, the loaded config file and the package directory to workers; a refuted property's rerun line now names the config and project it needs and quotes a path with spaces. `@systemfsoftware/vitest-config` lists the plugin.
