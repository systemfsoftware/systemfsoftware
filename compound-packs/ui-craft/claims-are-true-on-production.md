---
title: Every claim and every number on a screen is true on production today, and copy is mined from real users
applies_when:
  - writing or reviewing copy, headings, empty states or example data on a product screen
  - a screen describes something the product does, will do or did
  - an example number, user count, testimonial or live price appears on a page
tags: [ui-craft, copy, truth, claims, data, provenance]
---

A screen that promises what production cannot do is scored lower than a plain one, however it looks. On 2026-10-23 an outside reviewer scored the product's marketing landing page 5 of 10 because its headline said an agent builds a live app with an email alert and keeps it refreshing after the tab closes, while the signed-in conversation on production showed the agent failing to save a version and both venues returning "Unavailable". The design was fine; the claim was not true.

1. **Claims.** Each sentence that says what the product does maps to a behaviour a person can reproduce on production today. What it cannot do goes in the brief's "Not yet true" list, and no screen, call to action or example implies it.
2. **Numbers.** A number is a recorded or live reading with its source and an as-of time, small but legible. An example is labelled by what it is only when a source line would not already say so; a recorded reading is shown as `<what>, <value>, <source>, <time UTC>`. No invented users, counts, testimonials, tickers or activity.
3. **Copy.** Words come from the verbatim phrases of real users in the brief's copy file, and speak to every market or case the product covers, not the one the builder liked. Metaphor taglines, triads, "not X but Y", em-dash cadence and inflated adjectives are read for and rejected by the judge, with the banned list from the brief.
4. **States.** Empty, loading and failure states are designed and truthful. Raw error text, tool-call failures and "Unavailable" are not shown to a person as content; a recoverable state names the next action. A surface whose core loop fails on production stays behind its flag until a production walk passes (`production-is-rechecked-after-deploy`).
5. **Calls to action** lead only into something that works. A "get access" button in front of a loop that fails is a false claim.

Gate: `judge` — Does any sentence, number, example or call to action on the rendered page claim behaviour that appears in the brief's "Not yet true" list or that the production walk did not reproduce? Does any number lack a source or as-of time? Does any visible text show an unrecoverable error, a placeholder emptiness or raw tool output?
