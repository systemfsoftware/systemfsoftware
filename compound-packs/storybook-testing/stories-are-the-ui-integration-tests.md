---
title: User-visible behaviour is proven by stories over the real app, never by a simulated-DOM suite or a shell test against a double
applies_when:
  - proving what a person sees or can do in a UI
  - an AI agent proposes a jsdom, happy-dom or Testing Library render test for a component
  - an AI agent proposes a unit test that renders a UI shell against a mocked module or a stubbed port
  - deciding where a UI change's tests belong
tags: [storybook, integration, browser, jsdom, test-placement, ui]
---

User-visible behaviour is proven by stories over the real app, and no jsdom, happy-dom or Testing Library render suite and no unit test of a UI shell against a double stands in for one; pure decisions keep their property tests. Dodds' "Write tests. Not too many. Mostly integration." puts confidence in tests that run the pieces together the way a user meets them. A simulated DOM lets a test pass while the shipped browser behaviour is broken, because Suspense, `useSyncExternalStore` and layout only behave as shipped in a real browser. A shell test against a double asserts the call the shell made. It proves neither that the fake is admissible nor what a person sees.

1. **A story over the real app is the proof.** A behaviour a person can see or perform is proven by a story that renders the real app over admissible port fakes (see `stories-compose-at-their-own-root.md`), run in a real browser by the Storybook Vitest addon (see `real-browser-axe-as-error.md`).
2. **No simulated DOM.** A jsdom, happy-dom or Testing Library render suite never proves UI behaviour. When one exists for a behaviour a story already proves, it is deleted. When it is the only proof, it is replaced by a story.
3. **No shell test against a double.** A test that renders a component against a mocked module or a stubbed port, and asserts what the stand-in received, is not written. The story asserts the outcome a person perceives instead. What an adapter's own tests may double is owned by `boundary-testing/no-mocks-on-internal-glue.md`.
4. **Pure decisions keep their property tests.** A decision the UI calls is proven by its property test in the lane the test-discipline Test Lanes table assigns (`packages/oxlint-plugin/oxlint-plugin-test-discipline/README.md`). The story proves that the UI shows the decision's outcome, and does not re-prove every input.

```tsx
// @vitest-environment jsdom
import type { Meta, StoryObj } from '@storybook/react-vite'
import { render, screen } from '@testing-library/react'
import { expect, userEvent } from 'storybook/test'
import { test, vi } from 'vitest'
import { postMessage } from '../src/channel-messages.ts'

// WRONG: a simulated DOM and a mocked module; the test proves the stand-in was called,
// not that a person sees the message.
vi.mock('../src/channel-messages.ts')

test('the composer posts the typed message', async () => {
  render(<App />)
  await userEvent.type(screen.getByRole('textbox', { name: 'Message' }), 'Hello all')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  await expect(vi.mocked(postMessage)).toHaveBeenCalledWith('Hello all')
})

// RIGHT: a story over the real app on the preview's fakes, in a real browser, asserting
// what a person sees.
const meta = { component: App } satisfies Meta<typeof App>
export default meta

export const PostedMessageAppears: StoryObj<typeof meta> = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole('textbox', { name: 'Message' }), 'Hello all')
    await userEvent.click(canvas.getByRole('button', { name: 'Send' }))
    await expect(await canvas.findByText('Hello all')).toBeVisible()
    await expect(canvas.getByRole('textbox', { name: 'Message' })).toHaveValue('')
  },
}
```

Grounds: Kent C. Dodds, Write tests. Not too many. Mostly integration. (https://kentcdodds.com/blog/write-tests); Storybook 10.6, Vitest addon (https://storybook.js.org/docs/writing-tests/integrations/vitest-addon); `docs/solutions/tooling-decisions/atom-react-browser-test-toolchain.md`.

Gate: `review` — reject a jsdom, happy-dom or Testing Library render suite and a shell test against a double offered as proof of UI behaviour. Under `src/`, test-discipline's `no-test-file-in-src` already refuses any test file that is not a property test.
