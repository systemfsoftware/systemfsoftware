---
"@systemfsoftware/oxlint-plugin-test-discipline": patch
---

`vitest-from-systemfsoftware-vitest` now lets `.storybook/vitest.setup.ts` value-import the lifecycle hooks `beforeAll`, `beforeEach`, `afterEach` and `afterAll` from `vitest`. Storybook's Vitest plugin loads that file beside the stories it registers itself, so the per-story hooks it installs (screenshots, DOM cleanup) cannot come from `@systemfsoftware/vitest`. The exemption is matched by the file's path, not by a comment or an option. Any other value from `vitest`, a namespace import of it, and every import from `@effect/vitest` are still refused in that file, and the same hook import in any other file, `.storybook/preview.tsx` and a nested or non-`.storybook` `vitest.setup.ts` included, is still refused.
