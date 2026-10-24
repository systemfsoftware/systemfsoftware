---
title: An independent design judge scores the same captures against a fixed rubric and gates the merge
applies_when:
  - a UI pull request is ready to merge
  - the only design verdict on a UI change is its author's self-score
  - building or changing the design judge, its rubric or its inputs
tags: [ui-craft, judge, rubric, merge, review, evals]
---

The agent that built a screen cannot grade it: it saw its intentions, not the page. A separate judge, a different model from the builder, reads the brief, the captures and the recorded facts, and scores them against the rubric below. The merge waits for its verdict. A person reads every `uncertain`. The judge's inputs are produced by code and never by the builder's description, and it does not see the builder's score first, so the builder's number cannot anchor it.

**Rubric.** Seven criteria, each scored 1 to 10 with the evidence cited first (the capture and the region of it, or the fact) and then the score. The overall score is the weighted mean, and the lowest criterion is reported beside it, because a page with one broken criterion is not an 8.

| Criterion            | Weight |
| -------------------- | ------ |
| Distinctive idea     | 25%    |
| Product truth        | 20%    |
| Task fit             | 15%    |
| Responsive and theme | 15%    |
| Copy                 | 10%    |
| Motion and craft     | 10%    |
| Honesty about state  | 5%     |

**Verdict.** `holds` needs an overall score of 8 or more, no criterion below 6, every fact holding and no claim in "Not yet true" on screen. `violated` is an overall score under 6 or any criterion under 3. Anything else is `uncertain`: the judge states which evidence it lacked. Merge proceeds on `holds`, rework on `violated` with the judge's defect list as the next order, and a person decides `uncertain`. A judge answers from the inputs only: it never judges a fact the browser can state (whether there is horizontal scroll, whether a font loaded), and it never judges something a screenshot cannot show (whether an endpoint works).

**Independence.** The judge is a different model family from the builder, runs in a fresh context with no access to the builder's transcript, and is pinned to a dated model version with its answers cached. A second judge on the same captures is a calibration tool (`the-judge-is-calibrated-on-pass-and-fail-cases`), not a second gate.

Gate: `judge` — Does the judge verdict file for this unit list the cited evidence per criterion, an overall score of at least 8, no criterion under 6 and no claim from "Not yet true"? Is the judge a different model from the builder, and is its calibration current?

**Blind-read clarity gate.** A Gemini read of the matrix screenshots, not told what the product is, must state the product correctly (who it is for, what it does and what the person gets) at 90% or more across the captures. Each capture is read in a fresh call with no brief and no page text, and the statement is compared with the brief's "What the product is" section by the judge. Below 90% the unit is `violated` for clarity and the copy goes back to its writer (`copy-is-written-by-gemini-from-the-copy-source`) with the misreadings as the next order.

Gate: `judge` — Does the verdict file record the blind-read statements per capture and a correct-product rate of at least 90%?
