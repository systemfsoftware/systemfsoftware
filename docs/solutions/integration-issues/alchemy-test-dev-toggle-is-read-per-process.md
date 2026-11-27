---
title: alchemy-test's ALCHEMY_TEST_DEV toggle is fixed for the process, so a test of it needs its own vitest run
date: 2026-11-27
category: integration-issues
module: alchemy-stack-layer
problem_type: integration_issue
component: testing_framework
severity: medium
applies_when:
  - testing code that resolves dev or cloud through @alchemy.run/test's resolveDev or toEffect
  - a test needs ALCHEMY_TEST_DEV set to a value other than the rest of the suite's
tags: [alchemy, alchemy-test, vitest, environment]
---

## Problem

`@alchemy.run/test`'s `resolveDev` reads `ALCHEMY_TEST_DEV` through Effect `Config`. Its `testDev` constant (`repos/alchemy/packages/alchemy-test/src/Core.ts`, line 378) also reads the variable once, when the module loads. Setting `process.env.ALCHEMY_TEST_DEV` after the module has loaded changes neither of them. With `ALCHEMY_TEST_DEV` unset at start-up, `resolveDev({ dev: true })` stayed `true` after the variable was set to `'0'`. With `ALCHEMY_TEST_DEV=0` set at start-up, it returned `false`. `vi.stubEnv` inside a scenario has the same problem, so a test of the toggle that stubs the environment passes or fails depending on the process, not on the code.

## Solution

Run a test of the toggle in a vitest config of its own, with the variable set in that config's `test.env`. Exclude the file from the default config, and chain the second run in the package's `test` script:

- `vitest.config.ts`: `exclude: [...ENGINE_TOGGLE_TESTS]`
- `vitest.toggle.config.ts`: `include: ENGINE_TOGGLE_TESTS` and `env: { ALCHEMY_TEST_DEV: '0' }`
- `"test": "vitest run && vitest run --config vitest.toggle.config.ts"`

`packages/alchemy-stack-layer/tests/engine-toggle.integration.test.ts` is the example. It fails when the config's value is changed to `'1'`.

## Related

Every passing Gherkin scenario runs a second time on fresh services. A file-level check that counts what its scenarios recorded sees each record twice. Count distinct values, as `tests/cloud/cloudflare-roundtrip.integration.test.ts` does for the deployed stage.
