---
title: A journey is one short embedded Gherkin scenario whose steps hold every query and call
applies_when:
  - writing a story that walks the app through one cross-capability behaviour
  - adding Given, When or Then steps with `@systemfsoftware/storybook-gherkin`
  - reviewing a scenario that carries a selector, a URL or a setup call
tags: [storybook, gherkin, bdd, journey, domain-language, play]
---

A cross-capability journey is one short scenario written with `@systemfsoftware/storybook-gherkin` in the story file: Given puts the app in a known state without user interaction, When is the one action, Then asserts an outcome a person can observe, step definitions hold every query and call, and no `.feature` file duplicates it. The scenario is the only statement of the behaviour a reader gets. A scenario that names markup, a URL or a setup call describes how the page is built instead of what the person can do, and it breaks on every restyle while the behaviour holds.

The Cucumber reference fixes what each keyword means. Given steps "put the system in a known state before the user (or external system) starts interacting with the system", When steps "describe an event, or an action", and a Then outcome "should be on an observable output". Implementation details "should be hidden in the step definitions".

1. **Given sets state, never by interacting.** A Given establishes a precondition, such as who is signed in or what a channel already holds. The state comes from the story's fakes. It never clicks, types or navigates.
2. **One When.** A scenario has one When: the single action whose outcome it proves. Two actions are two behaviours and two scenarios.
3. **Then is what a person observes.** A Then asserts what comes out of the app: text, an announcement, an enabled or disabled control. It never asserts a fake's call record or an atom's internal value.
4. **Steps hold the queries.** Every query, call and assertion lives in a step definition, a named step built once with `Given`, `When` or `Then` and reused across scenarios. Group repeated preconditions with `Steps`, and pass values through `capture` holes and the scenario's `with`. The scenario itself reads as domain prose.
5. **Embedded, never a sidecar.** The story is the specification. A `.feature` file beside it is forbidden by `storybook-gherkin`'s `SG5`. Story annotations such as `parameters` and `tags` go on the exported object literal that spreads the scenario, as its `SG10` requires.

```tsx
import type { Meta } from '@storybook/react-vite'
import { capture, feature, Given, Steps, Then, When } from '@systemfsoftware/storybook-gherkin'
import { expect, within } from 'storybook/test'

const meta = { title: 'Journeys/Post a message', component: App } satisfies Meta<typeof App>
const f = feature(meta, {})
export default meta

// WRONG: the scenario carries a URL, a markup selector and two actions, and its Then
// asserts nothing a person sees.
export const PostingWorks = f.scenario(
  'Ada opens the channel, posts and then edits a message',
  { with: { text: 'Hello all' } },
  Given`Ada opens /#/channels/general`(() => {
    window.location.hash = '#/channels/general'
  }),
  When`Ada types ${capture('text')} into textarea.composer, sends it and edits it`(async (ctx, caps) => {
    const composer = ctx.canvasElement.querySelector('textarea.composer')
    if (composer instanceof HTMLTextAreaElement) await ctx.userEvent.type(composer, caps.text)
    await ctx.userEvent.click(ctx.canvas.getByRole('button', { name: 'Send' }))
    await ctx.userEvent.click(ctx.canvas.getByRole('button', { name: 'Edit' }))
  }),
  Then`it worked`(() => {}),
)

// RIGHT: domain-language steps defined once; the scenario is one behaviour in prose.
const isSignedIn = Given`${capture('person')} is signed in to ${capture('channel')}`(async (ctx, caps) => {
  await expect(await ctx.canvas.findByRole('heading', { name: caps.channel })).toBeVisible()
})
const SignedIn = Steps(isSignedIn)

const postsMessage = When`${capture('person')} posts ${capture('text')}`(async (ctx, caps) => {
  await ctx.userEvent.type(ctx.canvas.getByRole('textbox', { name: 'Message' }), caps.text)
  await ctx.userEvent.click(ctx.canvas.getByRole('button', { name: 'Send' }))
})

const messageIsShown = Then`${capture('text')} is shown in the channel`(async (ctx, caps) => {
  const messages = ctx.canvas.getByRole('list', { name: 'Messages' })
  await expect(await within(messages).findByText(caps.text)).toBeVisible()
})

export const PostedMessageIsShown = {
  ...f.scenario(
    'Ada posts a message and the channel shows it',
    { with: { person: 'Ada', channel: 'General', text: 'Hello all' } },
    SignedIn,
    postsMessage,
    messageIsShown,
  ),
  tags: ['journey'],
}
```

Grounds: Cucumber, Gherkin reference (https://cucumber.io/docs/gherkin/reference); the `storybook-gherkin` API report (`packages/gherkin/storybook-gherkin/etc/storybook-gherkin.api.md`) and its `AGENTS.md` mandates `SG5` and `SG10`.

Gate: `review` — reject a scenario whose Given interacts, that has more than one When, whose Then asserts something no person observes, that carries a selector, URL or setup call in its text or inline handlers, or that has a `.feature` file beside its story.
