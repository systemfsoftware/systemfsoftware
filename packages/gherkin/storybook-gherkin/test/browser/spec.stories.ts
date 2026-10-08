import { capture, feature, Given, Then, When } from '@systemfsoftware/storybook-gherkin'
import '@vitest/browser/matchers'
import { expect } from 'storybook/test'

const f = feature({}, {})

export default {
  ...f,
  title: 'StorybookGherkin/Greeting',
  render: () => null,
}

export const AliceReceivesAGreeting = f.scenario(
  'Alice receives a greeting that names her',
  { with: { user: 'alice', greeting: 'Hello, alice' } },
  Given`the user ${capture('user')} has an account`(() => {}),
  When`the system greets ${capture('user')}`(() => {}),
  Then`the greeting mentions ${capture('user')} and reads "${capture('greeting')}"`(
    (_ctx, caps) => {
      void expect(caps.greeting).toContain(caps.user)
    },
  ),
)

const GreetingsByName = f
  .scenarioOutline(
    'a greeting names the user it addresses',
    Given`the user ${capture('user')} has an account`(() => {}),
    When`the system greets ${capture('user')}`(() => {}),
    Then`the greeting mentions ${capture('user')} and reads "${capture('greeting')}"`(
      (_ctx, caps) => {
        void expect(caps.greeting).toContain(caps.user)
      },
    ),
  )
  .examples([
    { name: 'Alice is greeted by name', user: 'alice', greeting: 'Hello, alice' },
    { name: 'Bob is greeted by name', user: 'bob', greeting: 'Welcome back, bob' },
  ])

export const AliceIsGreetedByName = GreetingsByName['Alice is greeted by name']
export const BobIsGreetedByName = GreetingsByName['Bob is greeted by name']

export const GreetingIsAnnounced = f.scenario(
  'the greeting is announced to the user',
  { with: { greeting: 'Hello, alice' } },
  Given`the page announces "${capture('greeting')}"`((ctx, caps) => {
    const announcement = document.createElement('p')
    announcement.setAttribute('role', 'status')
    announcement.textContent = caps.greeting
    ctx.canvasElement.appendChild(announcement)
  }),
  Then`the announcement is visible`((ctx) => ctx.expect(ctx.canvas.getByRole('status')).toBeVisible()),
  Then`the announcement reads "${capture('greeting')}"`((ctx, caps) =>
    ctx.expect(ctx.canvas.getByRole('status')).toMatchAriaInlineSnapshot(`- status: ${caps.greeting}`)
  ),
)
