---
title: A deployed screen shows only recorded or live data, never invented figures, people, testimonials or activity
applies_when:
  - putting numbers, names, ratings, reviews, testimonials, customer logos or an activity feed on a user-facing screen
  - deciding what a screen shows before it has any real data (a first-run or empty state)
  - adding sample or placeholder content to a component that ships
tags: [content, data, testimonials, empty-state]
---

Read every number, person, count, rating, review, testimonial, customer logo and activity item a deployed screen renders from stored or live data. Show a testimonial, review or logo from static content only when the change links to where that real person or customer gave it. A screen with no data yet shows its empty state, never sample rows. Keep sample data in stories, tests and fixtures, which never ship; never ship a hard-coded count ("12,000 teams") or a random or faker call.

```tsx
// WRONG
const stats = [{ label: 'Teams', value: '12,000+' }]
// RIGHT
{account.teamCount === 0 ? <NoTeamsYet /> : <Stat label='Teams' value={account.teamCount} />}
```
