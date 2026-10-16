---
"@systemfsoftware/storybook-gherkin": minor
---

Step contexts now carry `expect`: the assertions of whichever runner the play runs in.

Under Storybook it stays `storybook/test`'s `expect`. In vitest browser mode (through `@storybook/addon-vitest`) it is vitest's own `expect`, so a step handler can reach the matchers only vitest has — `toMatchScreenshot`, `toMatchAriaInlineSnapshot`, `toMatchTextContent` — as `await ctx.expect(locator).toMatchAriaInlineSnapshot(…)`, without importing `vitest` where a project bans that import.

The assertions are promise-shaped: `await` them. `vitest` is an optional peer dependency.
