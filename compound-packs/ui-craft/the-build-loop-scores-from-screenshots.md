---
title: The build loop captures the evidence matrix, scores it harshly against the brief and repeats until the score is 8
applies_when:
  - an agent builds or changes a page or screen and reports it done
  - a UI unit's evidence is a description of the result instead of screenshots
  - reviewing a self-score that has no screenshots, no listed mistakes or no fixes
tags: [ui-craft, screenshots, viewport, theme, reduced-motion, score, loop]
---

The builder verifies its own work in a real browser and scores it, then fixes what the score names, then captures again. A builder that cannot see the page ships what it intended, not what rendered. The loop ends when the score is 8 or more and every fact below holds; it does not end when the builder is tired.

**Evidence matrix.** Six captures of the production build (not a dev server with its toolbar) at 390, 768 and 1440 pixels wide, each in light and dark, with fonts loaded and animation paused for the still. Two further runs with `prefers-reduced-motion: reduce` at 390 and 1440, which must show the content without the motion, and a run with the reduced-motion preference off to prove the motion starts. Save them under `shots/`, named `final-<width>-<theme>.png`, unretouched.

**Facts a capture records**, read from the browser and saved next to the images, never judged by eye:

- `document.documentElement.scrollWidth <= window.innerWidth` at every width (no horizontal scroll);
- zero console errors and zero failed requests on load;
- every web font loaded (`document.fonts.check` for each face the design names) and no fallback face in a computed style on text that is visible;
- axe violations, none at `serious` or `critical`;
- the first-paint time and the largest contentful paint on the production build;
- that each interactive control the brief names answers to keyboard and pointer, and that a pause or reduce-motion control exists where motion is autoplayed.

**The score** is out of 10, written to `score.md` against the brief's criteria with a weight and a reason each, harsh enough that a design-literate person who has not seen the page would share it. It lists the first pass's score, each defect with a link to the capture that shows it (`shots/mistake-<what>.png`), the fix, and the final score. A score with no recorded defects is a score that was not looked for. Every claim of "responsive" or "works in dark mode" names the capture that shows it.

**Loop.** Capture, score, list defects, fix, capture again. The builder stops at 8 or more with all facts holding, or reports blocked with the facts that fail. The next step is the independent judge, not a merge: a builder's own 8 is an input to `an-independent-judge-gates-the-merge`, never a substitute.

Evidence. The landing run's first pass scored 7.3 with named defects (an options caption touching its circular boundary, access presets expanding into full-width rows, a workflow compressed into three steps, Astro's dev toolbar in the captures). The second pass fixed them, a final inspection caught inherited square input corners and a reduced-motion defect in which deliberate Play was ignored, and the final score was 8.2 with all six captures saved.

Gate: `fact` — Does `shots/` hold the six matrix captures and the reduced-motion runs, and does the facts file record `scrollWidth <= innerWidth`, zero console errors, fonts loaded and no serious axe violations for each? `review` — Does `score.md` list a first-pass score, defects with captures, fixes and a final score of at least 8 against the brief's criteria?
