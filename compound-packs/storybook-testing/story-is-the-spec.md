---
title: A journey is a short embedded Gherkin scenario in domain language over reusable steps
applies_when:
  - writing a cross-capability journey or a component story with a play function
  - an AI agent proposes a .feature sidecar, or a selector or URL inside a scenario
  - reviewing a story's scenario or its step library
tags: [storybook, gherkin, bdd, domain-language, play]
---

A journey is an embedded Gherkin scenario in domain language (past-tense Given, present-tense When, observable Then), a short scenario of three to five steps covering one behaviour, whose steps are reusable step definitions, with no selector, URL or setup inline in the scenario.

The story is the spec, so its scenario is the only statement of the behaviour a reader gets. A scenario that names markup, a URL or a setup call describes how the page is built instead of what the person can do, and breaks on every restyle while the behaviour holds. A Then about layout passes when the behaviour is gone. A long scenario hides which step proves what, and steps written inline in one story are rewritten, slightly differently, in the next.

1. **Embedded, never a sidecar.** Write the scenario with `@systemfsoftware/storybook-gherkin` (`feature`, `Given`, `When`, `Then`, `capture`) inside the story file. A `.feature` file beside a story is a second copy that drifts.
2. **Tense carries meaning.** A Given states what has already happened, a When states what the person does now, and a Then states something they can observe.
3. **Steps live in a step library.** Step definitions are shared across journeys and query through accessible roles and names (`real-browser-a11y-and-interaction`), never through markup structure.

```tsx
// WRONG: a present-tense Given, a step body inline in the story that queries markup,
// and a Then that describes layout
export const PostingAMessage = f.scenario(
  'A member posts a message',
  Given`the member is on the channel page`(async (ctx) => {
    await ctx.userEvent.click(ctx.canvasElement.querySelector('nav > ul > li:nth-child(2) a')!)
  }),
  When`the member posts a message`(async (ctx) => {
    await ctx.userEvent.type(ctx.canvasElement.querySelector('#composer textarea')!, 'Hello all')
    await ctx.userEvent.click(ctx.canvasElement.querySelector('.send-btn')!)
  }),
  Then`the message appears at the bottom of the second column`(async (ctx) => {
    await ctx.expect(ctx.canvasElement.querySelector('.col-2 li:last-child')).toBeVisible()
  }),
)

// RIGHT: domain language over a shared step library; the Given is a past event,
// and every step queries by role
// the step library, shared by every journey
export const hasSignedIn = Given`${capture('person')} has signed in`(async (ctx, { person }) => {
  await signIn(ctx, person)
})
export const opensChannel = When`they open ${capture('channel')}`(async (ctx, { channel }) => {
  await ctx.userEvent.click(await ctx.canvas.findByRole('link', { name: channel }))
})
export const postsMessage = When`they post ${capture('text')}`(async (ctx, { text }) => {
  await ctx.userEvent.type(ctx.canvas.getByRole('textbox', { name: 'Message' }), text)
  await ctx.userEvent.click(ctx.canvas.getByRole('button', { name: 'Send' }))
})
export const messageIsListed = Then`${capture('text')} is shown in the channel`(async (ctx, { text }) => {
  await ctx.expect(await ctx.canvas.findByRole('listitem', { name: text })).toBeVisible()
})

// the journey story
const f = feature({}, {})
export default { ...f, title: 'Journeys/Post a message', component: App }

export const PostedMessageIsShown = f.scenario(
  'A posted message is shown in its channel',
  { with: { person: 'Ada', channel: 'General', text: 'Hello all' } },
  hasSignedIn,
  opensChannel,
  postsMessage,
  messageIsListed,
)
```

Gate: `review` — reject a scenario with a present-tense Given, a selector, URL or setup call in a step sentence or inline step body, a Then about layout, more than one behaviour, or a `.feature` file beside a story.
