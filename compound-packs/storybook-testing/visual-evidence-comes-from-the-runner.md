---
title: A story's visual evidence comes from the runner's capture hook, never from page.screenshot in a story or a CI collection script
applies_when:
  - adding screenshots or other visual evidence to stories
  - adding or changing a CI step that collects, renames or uploads UI evidence
  - an AI agent writes `page.screenshot` in a story, play function, step handler or Vitest browser test
  - a pull request commits images under a screenshot or attachments folder
tags: [storybook, screenshots, visual-evidence, vitest, ci, artifacts]
---

A story's evidence image comes from one capture hook that the Storybook Vitest project runs after every story, and a failure's image comes from Vitest. CI uploads both folders as they are. A capture written into each story records whatever the step reached, under a name the story chose, and a CI script that hunts for those files and renames them is a second, untested path that decides what evidence exists. Storybook core ships no screenshot API, and its own visual testing (Chromatic) needs a cloud account and a project token, so the capture belongs to the test runner.

1. **One hook, registered.** A setup file's `afterEach` captures every story, through a capture library such as `@storycap-testrun/browser` (`screenshot(page, context)`, with its `storycap(...)` Vitest plugin in the project's `plugins`). The Storybook Vitest project lists that file in `test.setupFiles`. The addon never finds a setup file on its own: it prepends its internal setup files to the ones the project declares (Storybook `v10.6.1`, `code/addons/vitest/src/vitest-plugin/index.ts:371-376`). A setup file that calls `setProjectAnnotations` composes the a11y annotations too (`real-browser-axe-as-error.md` item 4).
2. **Failures through Vitest.** The Storybook Vitest project sets `browser.screenshotFailures: true` explicitly: the addon sets it to `false` whenever the project has a `test.browser` config and leaves the flag unset (Storybook `v10.6.1`, `code/addons/vitest/src/vitest-plugin/index.ts:433-440`), which overrides Vitest's own default. Vitest writes failure images to `<attachmentsDir>/failure-screenshots/<test file>/<test>.png` (Vitest `v5.0.1`, `packages/browser/src/client/tester/runner.ts:187-204`), not to the screenshot folder.
3. **No capture in a story.** No story, play function, step handler or Vitest browser test calls `page.screenshot`, directly or through a helper. The hook captures after the play function ends, so a state worth an image is its own story, the way `journeys-are-embedded-gherkin.md` gives each journey one When.
4. **Run output, never committed.** The hook's output folder (default `__screenshots__`) and Vitest's attachments folder (default `.vitest/attachments`, ignored as `.vitest/`) are both in the repository's ignore list, and no image is committed. A reference screenshot recorded from the component's own render is the subject's output, which `boundary-testing/expected-values-never-come-from-the-subjects-output.md` already refuses.
5. **CI uploads the folders.** One `actions/upload-artifact` step uploads both folders, as paths relative to the Storybook project, with `if: ${{ !cancelled() }}` and `if-no-files-found: warn`, so a failing run keeps its evidence and a missed folder shows in the run. No step re-captures, copies, renames or post-processes images, and no step sends stories to a cloud visual-testing service.

Playwright journeys against a running app are outside this rule: their `page` is the server-side Playwright object, which Vitest documents as a different object from its browser `page`.

```tsx
// WRONG (a product repo, 2026-10-12): each story step captures its own image, and a CI
// script later collects whatever files the steps wrote.
import { page } from 'vitest/browser'

export const SubmitsTheOrder: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Submit order' }))
    await page.screenshot({ path: `evidence/${Date.now()}-submitted.png` })
    await expect(await canvas.findByText('Order placed')).toBeVisible()
  },
}

// RIGHT (the shape of an unnamed reference app): one hook captures every story.
// .storybook/vitest.setup.ts
import * as a11yAnnotations from '@storybook/addon-a11y/preview'
import { setProjectAnnotations } from '@storybook/react-vite'
import { screenshot } from '@storycap-testrun/browser'
import { afterEach } from 'vitest'
import { page } from 'vitest/browser'
import * as projectAnnotations from './preview.ts'

setProjectAnnotations([a11yAnnotations, projectAnnotations])

afterEach(async (context) => {
  await screenshot(page, context)
})

// vitest.config.ts, the Storybook project
//   plugins: [storybookTest({ configDir: '.storybook' }), storycap({ viewport: { width: 1280, height: 720 } })],
//   test: { setupFiles: ['./.storybook/vitest.setup.ts'], browser: { enabled: true, screenshotFailures: true } }
// .gitignore
//   __screenshots__/
//   .vitest/
// CI, after the test step
//   - if: ${{ !cancelled() }}
//     uses: actions/upload-artifact@v7
//     with: { name: story-evidence, path: "apps/web/__screenshots__/\napps/web/.vitest/", if-no-files-found: warn }

// The story asserts only what a person sees.
export const SubmitsTheOrder: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Submit order' }))
    await expect(await canvas.findByText('Order placed')).toBeVisible()
  },
}
```

Grounds: Storybook source, the Vitest plugin's `setupFiles` (https://github.com/storybookjs/storybook/blob/v10.6.1/code/addons/vitest/src/vitest-plugin/index.ts#L371-L376) and its `screenshotFailures` override (https://github.com/storybookjs/storybook/blob/v10.6.1/code/addons/vitest/src/vitest-plugin/index.ts#L433-L440); Vitest source, the failure screenshot (https://github.com/vitest-dev/vitest/blob/v5.0.1/packages/browser/src/client/tester/runner.ts#L187-L204); `@storycap-testrun/browser` README (https://github.com/reg-viz/storycap-testrun/blob/main/packages/browser/README.md); Vitest, `browser.screenshotFailures` (https://vitest.dev/config/browser/screenshotfailures) and the browser context API, whose `page` "is not the same object" as Playwright's (https://vitest.dev/api/browser/context); Storybook 10.6, Vitest addon (https://storybook.js.org/docs/writing-tests/integrations/vitest-addon) and Visual tests (https://storybook.js.org/docs/writing-tests/visual-testing); GitHub Actions status-check functions (https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions).

Gate: `review` — Outside a linter's planted fixtures, does the diff call `page.screenshot` in a story, play function, step handler or Vitest browser test, directly or through a helper? Does it add a capture hook in a setup file that no Storybook Vitest project lists in `test.setupFiles`, or without ignore entries for the hook's output folder and `.vitest/`? Does a Storybook Vitest project it adds or changes leave `browser.screenshotFailures` unset or `false`? Does it commit an image under either folder? Does a CI step do more with UI evidence than one `actions/upload-artifact` of those folders that also runs on failure?

Lint: `@systemfsoftware/oxlint-config-recommended` sets `no-restricted-properties` for `page.screenshot` on `**/*.stories.ts` and `**/*.stories.tsx`, each message naming `storybook-testing/visual-evidence-comes-from-the-runner`. The file suffix is the lint's proxy for "a story", not the rule's scope: review owns every story and browser test the suffix misses, a renamed `page`, a capture helper, the setup-file registration, ignore entries and CI steps.
