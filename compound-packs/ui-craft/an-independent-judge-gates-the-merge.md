---
title: An independent design judge scores the same captures against a fixed rubric and gates the merge
applies_when:
  - a UI pull request is ready to merge
  - the only design verdict on a UI change is its author's self-score
  - building or changing the design judge, its rubric or its inputs
tags: [ui-craft, judge, rubric, merge, review, evals]
---

The agent that built a screen cannot grade it: it saw its intentions, not the page. A separate judge, a different model from the builder, reads the brief, the captures and the facts, and scores them against the rubric below. The merge waits for its verdict. A person reads every `uncertain`.

**Inputs the judge receives**, all produced by code and none by the builder's description: `BRIEF.md`; the six matrix captures and the reduced-motion runs; the facts file of `the-build-loop-scores-from-screenshots`; the reference images and the chosen direction; and the product's "Not yet true" list. It does not see the builder's score first, so the builder's number cannot anchor it.

**Rubric.** Seven criteria, each scored 1 to 10 with the evidence cited first (the capture and the region of it, or the fact) and then the score. The overall score is the weighted mean, and the lowest criterion is reported beside it, because a page with one broken criterion is not an 8.

| Criterion            | Weight | A 9 looks like                                                                                           | A 3 looks like                                                                               |
| -------------------- | ------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Distinctive idea     | 25%    | one idea carries the screen and could be named in a sentence; it survives covering the logo              | a standard layout of cards and a hero, interchangeable with any product in the category      |
| Product truth        | 20%    | every number has a source and an as-of time; every claim is something production does today              | claims the product cannot fulfil, placeholder emptiness shown as the product, raw error text |
| Task fit             | 15%    | the decision the surface exists for is the most visible thing and is answered with concrete data         | decoration that carries no decision; the primary action is the wrong one                     |
| Copy                 | 10%    | short, literal, in the user's words, specific names and numbers                                          | metaphor taglines, triads, "not X but Y", em-dash cadence, inflated adjectives               |
| Responsive and theme | 15%    | 390, 768 and 1440 each look designed, light and dark both considered, no horizontal scroll               | a stretched or stacked copy of the desktop layout; dark mode is an inversion                 |
| Motion and craft     | 10%    | motion is driven by data or the person's action, respects reduced motion, type and spacing hold a system | motion is ornament; mixed radii, fallback fonts, inconsistent spacing                        |
| Honesty about state  | 5%     | loading, empty and failure are designed and truthful                                                     | failed tool calls and "Unavailable" shown as content                                         |

**Verdict.** `holds` needs an overall score of 8 or more, no criterion below 6, every fact holding and no claim in "Not yet true" on screen. `violated` is an overall score under 6 or any criterion under 3. Anything else is `uncertain`: the judge states which evidence it lacked. Merge proceeds on `holds`, rework on `violated` with the judge's defect list as the next order, and a person decides `uncertain`. A judge answers from the inputs only: it never judges a fact the browser can state (whether there is horizontal scroll, whether a font loaded), and it never judges something a screenshot cannot show (whether an endpoint works).

**Independence.** The judge is a different model family from the builder, runs in a fresh context with no access to the builder's transcript, and is pinned to a dated model version with its answers cached. A second judge on the same captures is a calibration tool (`the-judge-is-calibrated-on-pass-and-fail-cases`), not a second gate.

**Copy** is judged by the same panel in a separate call over the text extracted from the rendered page, with the banned patterns named in the brief as the rubric, so a banned phrase in the page is found by reading, not by matching a string.

Gate: `judge` — Does the judge verdict file for this unit list the cited evidence per criterion, an overall score of at least 8, no criterion under 6 and no claim from "Not yet true"? Is the judge a different model from the builder, and is its calibration current?

**Blind-read clarity gate.** A Gemini read of the matrix screenshots, not told what the product is, must state the product correctly (who it is for, what it does and what the person gets) at 90% or more across the captures. Each capture is read in a fresh call with no brief and no page text, and the statement is compared with the brief's "What the product is" section by the judge. Below 90% the unit is `violated` for clarity and the copy goes back to its writer (Gemini, see `each-step-loads-its-curated-skills`) with the misreadings as the next order.

Gate: `judge` — Does the verdict file record the blind-read statements per capture and a correct-product rate of at least 90%?
