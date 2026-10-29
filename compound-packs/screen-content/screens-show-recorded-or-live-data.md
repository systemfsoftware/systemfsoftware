---
title: A deployed screen shows only recorded or live data, never invented figures, people, testimonials or activity
applies_when:
  - putting numbers, names, ratings, reviews, testimonials, customer logos or an activity feed on a user-facing screen
  - deciding what a screen shows before it has any real data (a first-run or empty state)
  - adding sample or placeholder content to a component that ships
tags: [content, data, testimonials, empty-state]
---

Every number, person, count, rating, review, testimonial, customer logo and activity item a deployed screen renders is read from stored or live data. A testimonial, review or logo shown from static content is allowed only when the change links to where that real person or customer gave it. A screen with no data yet shows its empty state, never sample rows. Sample data lives only in stories, tests and fixtures, which never ship.

Review test: trace each value the diff renders on a deployed screen to where it comes from. The change fails when the value is a literal or generated in code that ships (an array of sample records, a hard-coded count such as '12,000 teams', a random or faker call), or when it is a testimonial, review or logo whose real origin the change does not link.

Prevents: a person deciding on usage, ratings or endorsements that never happened.

```tsx
// WRONG: invented figures and a made-up customer
const stats = [{ label: 'Teams', value: '12,000+' }, { label: 'Orders shipped', value: '4.2M' }]
<Quote author="Jordan, operations lead">It changed how we work.</Quote>
```

```tsx
// RIGHT: the figure is read from the account store, and an empty store shows the empty state
{
  account.teamCount === 0 ? <NoTeamsYet /> : <Stat label='Teams' value={account.teamCount} />
}
```

Source: US Federal Trade Commission, Rule on the Use of Consumer Reviews and Testimonials (16 CFR Part 465, announced 2024-08-14), which bans reviews and testimonials that 'misrepresent that they are by someone who does not exist' or by people who 'did not have actual experience with the business', and fake indicators of social media influence: https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials

The review judge decides from the diff and the tree, never from the author's description; an uncertain verdict escalates to a person and never passes.

Gate: judge
