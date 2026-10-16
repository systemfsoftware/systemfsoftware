export interface StoryPlan {
  readonly user: string
  readonly greeting: string
}

export const aliceGreeting: StoryPlan = {
  user: 'alice',
  greeting: 'Hello, alice',
}
