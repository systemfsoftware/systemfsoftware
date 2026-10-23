---
title: UI work starts from a written brief that holds the founder's verdict, the real copy source and the evidence matrix
applies_when:
  - an agent is asked to design, redesign or build a page, a screen or a user-facing surface
  - writing or reviewing the order a coding agent receives for a landing page, an app shell or a signed-in screen
  - a UI order has no references, no banned patterns or no named viewports
tags: [ui-craft, brief, design, landing, copy, references]
---

A UI unit starts from one `BRIEF.md` the agent reads before anything else, written by the conductor from the founder's own words and the product's real data. A prompt that says "make it modern and clean" gives the builder nothing to be wrong against, so the result is the average page of its training set. The brief makes the target specific enough that a screenshot can fail it.

Every section below is required. A section that does not apply says why in one line; it is never left out.

```markdown
# <Product>: <the surface> (one line naming the bar: "the kind of page people screenshot and share")

You are redesigning and implementing <surface> in <path or package>. <Stack in one sentence.>

## Verdict so far

Verbatim quotes from the founder about every earlier version, each with its date. Examples
from the landing run: "it just needs to not be a bunch of static [expletive] tables",
"complete AI slop" (about the copy), "is this really a 360 view of the markets with dynamic
interfaces?". Quotes are never paraphrased: a paraphrase loses the complaint.

## What the product is (only claim what is true)

Two or three sentences: who the person is, what they type or do, what the product returns,
what it never does, who can use it today and at what price. Every noun here is true on
production today. Anything not yet true goes in "Not yet true" below and stays off the screen.

## Purpose of this surface

The one decision a visitor or user makes here, in a sentence. A surface with two purposes is
two surfaces.

## The surface must

Numbered, each checkable from a screenshot or a browser fact: what is visible first, what moves
and what it is driven by, what is absent (for example "zero static data tables"), which existing
behaviour keeps working (forms, endpoints, bot checks, pricing data), first-paint approach.

## Real data

Where every number comes from: a recorded fixture, a public feed, a connector. Each number on
screen carries its source and as-of time. No invented numbers, users, testimonials or live tickers.

## Copy

The file of verbatim phrases from real users (forum, Reddit, X posts) the copy is mined from,
with its path. Banned patterns for this product, as judged by a person or the judge, not
matched: metaphor taglines, triads, "not X but Y", em-dash cadence, inflated adjectives
("seamless", "powerful", "effortless", "unlock", "supercharge"), a period after a heading.

## References

At least three, each with what to take from it and what not to: the product's own design
system (the baseline, not a cage), one craft reference (irys.xyz for scroll and motion craft),
one interaction reference (Claude.ai for a conversation surface; nythrox/Stead for a card slot
the agent writes against), and the earlier pass the founder approved, if one exists. A
reference is studied for structure and motion, never copied.

## Banned patterns

Static tables of data on a marketing page, decorative icons that carry no decision, stock
gradients and glass cards as the only design idea, empty states shown as the product, raw
error text shown to a user, any claim in "Not yet true".

## Evidence matrix

Viewport widths 390, 768 and 1440 by light and dark (six captures), plus reduced motion on
(`prefers-reduced-motion: reduce`) at 390 and 1440. No horizontal scroll at any width. Local
fonts loaded before capture. Where the captures are saved.

## Process (in this order)

Directions, reference images, build, self-check loop to a score of 8 or more, then the
independent judge. Names the skills each step loads (see each-step-loads-its-curated-skills).

## Not yet true

What the product cannot do on production today, listed so the builder cannot promise it.

## Done means

Typecheck, lint and stories pass; the score file and captures exist; the judge verdict is
`holds`; commit message names the Linear id; no AI trailers where the repository bans them.
```

The brief is a file in the unit's report directory, not a chat message: the self-check loop, the judge and the production re-check all re-read it, and a later session finds out what the founder asked for.

Incident. The landing page had drawn the founder verdicts quoted in the brief template (static tables, "complete AI slop" copy, no sense of a 360 view) before the run built from `reports/landing-astra/BRIEF.md`, the brief this template generalises. That run scored 8.2 on its own loop and was approved.

Gate: `review` — Does the UI unit have a brief file with every section above, verbatim founder quotes, a copy source file that exists, at least three references each with a take and a not-take, and the six-capture matrix plus reduced motion? Is every statement under "What the product is" true on production today?
