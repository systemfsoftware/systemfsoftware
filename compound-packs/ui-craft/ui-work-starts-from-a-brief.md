---
title: UI work starts from a written brief that holds the founder's verdict, the real copy source and the evidence matrix
applies_when:
  - an agent is asked to design, redesign or build a page, a screen or a user-facing surface
  - writing or reviewing the order a coding agent receives for a landing page, an app shell or a signed-in screen
  - a UI order has no references, no banned patterns or no named viewports
tags: [ui-craft, brief, design, landing, copy, references]
---

A UI unit starts from one `BRIEF.md` the agent reads before anything else, written by the conductor from the founder's own words and the product's real data. A prompt that says "make it modern and clean" gives the builder nothing to be wrong against, so the result is the average page of its training set. The brief makes the target specific enough that a screenshot can fail it.

Every section below is required in `BRIEF.md`. A section that does not apply says why in one line; it is never left out.

- **Verdict so far:** verbatim quotes from the founder about every earlier version, each with its date. Quotes are never paraphrased, because a paraphrase loses the complaint.
- **What the product is:** two or three sentences on who the person is, what they do, what the product returns, what it never does, who can use it today and at what price. Every noun is true on production today; anything not yet true goes in "Not yet true" and stays off the screen.
- **Purpose of this surface:** the one decision a visitor or user makes here. A surface with two purposes is two surfaces.
- **The surface must:** numbered items, each checkable from a screenshot or a browser fact (what is visible first, what moves and what drives it, what is absent, which existing behaviour keeps working).
- **Real data:** where every number comes from (a recorded fixture, a public feed, a connector). Each number on screen carries its source and as-of time. No invented numbers, users, testimonials or live tickers.
- **Copy:** the path of the file of verbatim phrases from real users that the copy is mined from, and the banned patterns for this product, as judged by a person or the judge, never matched by pattern.
- **References:** at least three, each with what to take from it and what not to take: the product's own design system, one craft reference, one interaction reference, and the earlier pass the founder approved if one exists. A reference is studied for structure and motion, never copied.
- **Banned patterns:** what this surface must not show, such as static data tables on a marketing page, decorative icons that carry no decision, empty states shown as the product, raw error text, any claim in "Not yet true".
- **Evidence matrix:** widths 390, 768 and 1440 by light and dark, plus reduced motion at 390 and 1440, with no horizontal scroll, fonts loaded before capture, and the place the captures are saved.
- **Process:** the order directions, reference images, build, self-check loop to a score of 8 or more, independent judge.
- **Not yet true:** what the product cannot do on production today, so the builder cannot promise it.
- **Done means:** typecheck, lint and stories pass, the score file and captures exist, the judge verdict is `holds`, the commit message names the Linear id, and no AI trailers where the repository bans them.

The brief is a file in the unit's report directory, not a chat message: the self-check loop, the judge and the production re-check all re-read it, and a later session finds out what the founder asked for.

Incident. The landing page had drawn founder verdicts (static tables, "complete AI slop" copy, no sense of a 360 view) before the run built from `reports/landing-astra/BRIEF.md`, a brief that quoted them. That run scored 8.2 on its own loop and was approved.

Gate: `review` — Does the UI unit have a brief file with every section above, verbatim founder quotes, a copy source file that exists, at least three references each with a take and a not-take, and the six-capture matrix plus reduced motion? Is every statement under "What the product is" true on production today?
