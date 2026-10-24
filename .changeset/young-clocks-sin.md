---
"@systemfsoftware/effect-e2e": minor
---

Add the `./runner` entry for running suites under Vitest. `makeRunner(config, options)` returns a runner class extending Vitest's `TestRunner`: each try gets its own session, a test that never touches the app opens no engine, a test that passes on retry passes, and a test whose `platforms` exclude its target is skipped. A config that does not decode fails every test with `ConfigInvalid`, and `exitCodeReporter` ends that run with exit code 2. The entry also exports `e2eTestFiles`, `test`, `expect`, `describe` and the hooks. `test` hands the body `app`, `agent`, `screen` and `platform`; `expect(locator)` matchers retry until `assertionTimeout` and fail with the last value read, and other values use Vitest's `expect`. `vitest` is a peer dependency; no other entry imports it.
