---
title: A claim or call to action on a screen describes only what the code in the tree does
applies_when:
  - writing a heading, feature description, pricing line or call to action on a user-facing screen
  - adding a capability claim or a call to action to a landing or marketing page
  - changing or removing a feature that existing screen copy describes
tags: [content, claims, call-to-action]
---

Claim a capability, integration, limit, price or timing on a screen only when the code in the same tree performs it. Read a figure inside a claim (an interval, a limit, a price) from the constant or setting the code uses, never type it a second time into the copy. Point every call to action at a route or action that exists and completes the step its label names; one that leads only to a waitlist says so in its label. A change that removes or alters a capability updates every screen that claims it. Counts of users, customers or activity belong to screens-show-recorded-or-live-data.md.

```tsx
// WRONG: the sync job runs hourly, and the button does nothing
<h2>Syncs your inventory every minute</h2>
<Button onClick={() => {}}>Export to spreadsheet</Button>
// RIGHT
<h2>Syncs your inventory every {formatInterval(SYNC_INTERVAL)}</h2>
<Button onClick={exportOrders}>Export orders as CSV</Button>
```
