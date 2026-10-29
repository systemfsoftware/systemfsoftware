---
title: A claim or call to action on a screen describes only what the code in the tree does
applies_when:
  - writing a heading, feature description, pricing line or call to action on a user-facing screen
  - adding a capability claim or a call to action to a landing or marketing page
  - changing or removing a feature that existing screen copy describes
tags: [content, claims, call-to-action]
---

Every capability, integration, limit, price or timing a screen claims names something the code in the same tree performs. A figure inside such a claim (an interval, a limit, a price) is read from the constant or setting the code uses, never typed a second time into the copy. Every call to action leads to a route or action that exists in the tree and completes the step its label names; one that leads only to a waitlist says so in its label. A change that removes or alters a capability updates every screen that claims it. Counts of users, customers or activity are covered by screens-show-recorded-or-live-data.md.

Review test: for each claim or call to action the diff adds or touches, find the code that performs it. The change fails when no code path does it, when the call to action's route or handler is missing, empty or a stub, when a claimed figure differs from the value the code uses or is a hand-typed copy of it, or when the diff removes or alters a capability that a screen still claims.

Prevents: a person acting on a promise the product does not keep and reaching a dead end.

```tsx
// WRONG: the sync job runs hourly, and the button does nothing
<h2>Syncs your inventory every minute</h2>
<Button onClick={() => {}}>Export to spreadsheet</Button>
```

```tsx
// RIGHT: the interval is the one the sync job reads, and exportOrders writes the file
<h2>Syncs your inventory every {formatInterval(SYNC_INTERVAL)}</h2>
<Button onClick={exportOrders}>Export orders as CSV</Button>
```

Source: US Federal Trade Commission, Advertising FAQ's: A Guide for Small Business: 'Advertising must be truthful and non-deceptive', 'Advertisers must have evidence to back up their claims' and 'The law requires that advertisers have proof before the ad runs': https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business

The review judge decides from the diff and the tree, never from the author's description; an uncertain verdict escalates to a person and never passes.

Gate: judge
