---
title: A story's visual evidence comes from the runner's capture hook, never from page.screenshot in a story or a CI collection script
applies_when:
  - adding screenshots or other visual evidence to stories
  - adding or changing a CI step that collects, renames or uploads story evidence
  - an AI agent writes `page.screenshot` in a story, play function, step handler or a helper they call
  - a pull request commits images under a screenshot or attachments folder
tags: [storybook, screenshots, visual-evidence, vitest, ci, artifacts]
---

A story's evidence image comes from one capture hook that the Storybook preview registers for every story, and a failure's image comes from Vitest. CI uploads both folders as they are. A capture written into each story records whatever the step reached, under a name the story chose, and a CI script that hunts for those files and renames them is a second, untested path that decides what evidence exists. Stories already run as Vitest tests, and the runner can capture each one, so the capture belongs to the runner rather than to each story.

1. **One hook, registered from the preview.** The Storybook preview's project `beforeEach` registers Vitest's `onTestFinished` (imported from `@systemfsoftware/vitest`, which keeps it and refuses `afterEach`), and that callback captures the story through a capture library such as `@storycap-testrun/browser` (`screenshot(page, context)`, with its `storycap(...)` Vitest plugin from `@storycap-testrun/browser/vitest-plugin` in the project's `plugins`). The registration runs only in test mode (`import.meta.env.MODE === 'test'`) and imports the runner modules inside that guard, so the Storybook UI never loads them. The Vitest addon applies the preview's annotations itself when no setup file calls `setProjectAnnotations` (Storybook `v10.6.0`, `code/addons/vitest/src/vitest-plugin/index.ts:334-343`), runs each composed story inside its Vitest test (`code/addons/vitest/src/vitest-plugin/test-utils.ts:101-132`), and runs the preview `beforeEach` before every story (`code/core/src/csf/story.ts:395-402`). `onTestFinished` must be called within a test and runs when the test finishes, pass or fail (Vitest `v5.0.1`, `packages/vitest/src/runtime/runner/hooks.ts:257-294`).
2. **Failures through Vitest.** The Storybook Vitest project sets `browser.screenshotFailures: true` explicitly: the addon sets it to `false` whenever the project has a `test.browser` config and leaves the flag unset (Storybook `v10.6.0`, `code/addons/vitest/src/vitest-plugin/index.ts:418-425`), which overrides Vitest's own default. Vitest writes failure images to `<attachmentsDir>/failure-screenshots/<test file>/<test>.png` (Vitest `v5.0.1`, `packages/browser/src/client/tester/runner.ts:187-204`), not to the screenshot folder.
3. **No capture in a story.** No story, play function, step handler or helper they call runs `page.screenshot`. The hook captures after the story's test finishes, so a state worth an image is its own story, the way `journeys-are-embedded-gherkin.md` gives each journey one When.
4. **Run output, never committed.** The hook's output folder (default `__screenshots__`) and Vitest's attachments folder (default `.vitest/attachments`, ignored as `.vitest/`), where item 2's failure images land, are both in the repository's ignore list, and no image is committed. A reference screenshot recorded from the component's own render is the subject's output, which `boundary-testing/expected-values-never-come-from-the-subjects-output.md` already refuses.
5. **CI uploads the folders as they are.** CI uploads both folders, at the paths the run writes them, and also when tests fail, since failure images exist only for failing runs. No step re-captures, copies, renames or post-processes images.

Playwright journeys against a running app are outside this rule: their `page` is the server-side Playwright object, which Vitest documents as a different object from its browser `page`.

```tsx
// WRONG (a product repo, 2026-10-11): each story step captures its own image, and a CI
// script later collects whatever files the steps wrote.
import { page } from 'vitest/browser'

export const SubmitsTheOrder: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Submit order' }))
    await page.screenshot({ path: `evidence/${Date.now()}-submitted.png` })
    await expect(await canvas.findByText('Order placed')).toBeVisible()
  },
}

// RIGHT (the shape of an unnamed reference app's capture, registered the house way): the
// preview registers one capture for every story.
// .storybook/preview.ts
const captureEachStory = async (): Promise<void> => {
  if (import.meta.env.MODE !== 'test') return
  const [{ onTestFinished }, { page }, { screenshot }] = await Promise.all([
    import('@systemfsoftware/vitest'),
    import('vitest/browser'),
    import('@storycap-testrun/browser'),
  ])
  onTestFinished(async (context) => {
    await screenshot(page, context)
  })
}

export default { beforeEach: captureEachStory } satisfies Preview

// vitest.config.ts, the Storybook project
//   plugins: [storybookTest({ configDir: '.storybook' }), storycap({ viewport: { width: 1280, height: 720 } })],
//   test: { browser: { enabled: true, screenshotFailures: true } }
// .gitignore
//   __screenshots__/
//   .vitest/
// CI, after the test step, which runs from apps/web
//   - if: ${{ !cancelled() }}
//     uses: actions/upload-artifact@v7
//     with: { name: story-evidence, path: "apps/web/__screenshots__/\napps/web/.vitest/" }

// The story asserts only what a person sees.
export const SubmitsTheOrder: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Submit order' }))
    await expect(await canvas.findByText('Order placed')).toBeVisible()
  },
}
```

Grounds: the operator's ruling (2026-10-12) that Storybook already produces screenshots through the reference-app pattern; Storybook source, the addon's project-annotation provisioning (https://github.com/storybookjs/storybook/blob/v10.6.0/code/addons/vitest/src/vitest-plugin/index.ts#L334-L343), story run (https://github.com/storybookjs/storybook/blob/v10.6.0/code/addons/vitest/src/vitest-plugin/test-utils.ts#L101-L132), preview `beforeEach` (https://github.com/storybookjs/storybook/blob/v10.6.0/code/core/src/csf/story.ts#L395-L402) and `screenshotFailures` override (https://github.com/storybookjs/storybook/blob/v10.6.0/code/addons/vitest/src/vitest-plugin/index.ts#L418-L425); Vitest source, `onTestFinished` (https://github.com/vitest-dev/vitest/blob/v5.0.1/packages/vitest/src/runtime/runner/hooks.ts#L257-L294) and the failure screenshot (https://github.com/vitest-dev/vitest/blob/v5.0.1/packages/browser/src/client/tester/runner.ts#L187-L204); `@storycap-testrun/browser` README (https://github.com/reg-viz/storycap-testrun/blob/main/packages/browser/README.md); Vitest, `browser.screenshotFailures` (https://vitest.dev/config/browser/screenshotfailures) and the browser context API, whose `page` "is not the same object" as Playwright's (https://vitest.dev/api/browser/context); GitHub Actions status-check functions (https://docs.github.com/en/actions/reference/workflows-and-actions/expressions#status-check-functions).

Gate: `review` — Outside a linter's planted fixtures, does the diff run `page.screenshot` in a story, play function, step handler or a helper they call? Does it capture stories other than through one hook the Storybook preview registers, or without ignore entries for the capture folder and `.vitest/`? Does a Storybook Vitest project it adds or changes leave `browser.screenshotFailures` unset or `false`? Does it commit an image under either folder? Does a CI step re-capture, copy, rename or post-process story evidence, or upload it only when tests pass?

Lint: `@systemfsoftware/oxlint-config-recommended` sets `no-restricted-properties` for `page.screenshot` on `**/*.stories.ts` and `**/*.stories.tsx`, each message naming `storybook-testing/visual-evidence-comes-from-the-runner`. The file suffix is the lint's proxy for "a story", not the rule's scope: review owns the helpers a story calls, a renamed `page`, the preview registration, ignore entries and CI steps.
