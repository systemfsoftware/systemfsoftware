---
title: The design judge agrees with labelled pass and fail cases before its verdict gates a merge
applies_when:
  - the design judge, its rubric, its model or its inputs change
  - a judge verdict is used to merge or block a UI change
  - adding a labelled UI case from a person's verdict or a later outcome
tags: [ui-craft, judge, calibration, labels, kappa, evals]
---

A rubric nobody has tested on known answers is an opinion with a number on it. The judge fails a merge, or clears one, only while it agrees with a labelled set. The set is real screens with a label from an outcome or a person, written before the judge sees them, and it holds failures as well as passes, so a judge that scores everything 8 is caught.

**Labels** come from outcomes, never from the judge: the founder's verdict on the page, a later revert or rework of the change, or a person's score of the captures. A reviewer model may rate a case once as a second opinion; where the two disagree the case is `uncertain` and does not count against the judge. The set is split into a development part the rubric is tuned on and a frozen part it is measured on, and the rubric is not tuned on the frozen part.

**Agreement** is Cohen's kappa over `holds`, `violated` and `uncertain` on the frozen part, with the model, rubric text and input shape fingerprinted beside it. A kappa of 0.7 or more for the current fingerprint lets a verdict gate; a changed rubric, model or input field makes the calibration stale and the judge reports without gating. The judge must also place each pass case at 8 or more and each fail case below 6; a judge that does not separate them is not calibrated whatever its kappa.

**Seed cases** (2026-10-23). The images of the signed-in cases show one person's account and are not committed here; the set is kept as image files next to the judge's evals and each case there carries these labels and the quoted reasons.

| Case | Surface | Label | Score | Why |
| ---- | ------- | ----- | ----- | --- |
| landing-672 | public landing page, 390, 768, 1440, light and dark (`systemfsoftware/younna-ai` #672, merge commit `803ddabbc686bcb9ecb353958490d0e8d2213713`, `reports/landing-astra/shots/final-*.png`) | `holds` (pass) | 8.2 self, founder approved | eight market nodes around the person's question, layered SVG connections and recorded playback, all eight market classes visible on phones, source and as-of dates, no fabricated tickers, reduced motion respected |
| signed-in home | `/web/` at 1440 and 390 | `violated` (fail) | 2 | a date stamp, an empty "Made today" card and a single conversation name; no agent input, no way to start an app; a mobile bottom nav on a page that has nothing to navigate to |
| conversation | an app's chat with a preview, 1440 and 390 | `violated` (fail) | 1 | a plain transcript of failed tool calls; "Unavailable" and "couldn't save a new version" shown as content; no collapsed thinking, no compact tool rows |
| apps list | `/web/apps` | `violated` (fail) | 2 | two unstyled names under a "New conversation" button, no preview, number or timestamp, empty space below |
| connections | `/web/connections` | `violated` (fail) | 3 | one connector and a raw `https://example.com/mcp` field; the venues the product reads are absent; no connected or unavailable states |
| settings | `/web/settings` | `violated` (fail) | 2 | a model name and reasoning toggles, a grant renewal date, empty alert targets and invite counts; an admin panel, not a product |
| landing, same day | public landing page on production | `uncertain` | 5 | the widgets are good; the headline claims an agent-built live app and alerts that production could not deliver (`claims-are-true-on-production`) |

The scores of the five signed-in screens are an outside reviewer's (Grok, 2026-10-23, from production screenshots at 1440 and 390 and a written requirements file), and are labels for calibration, not authority: a verdict of a person on the same screens overrides them.

Add a case when a person's verdict or a revert disagrees with a judge verdict. Never delete a case the judge fails.

Gate: `judge` — Is the calibration for this judge's current model, rubric text and input shape recorded with a kappa of at least 0.7 on a frozen set that holds both pass and fail cases, and does the judge score every pass case at 8 or more and every fail case under 6?
