---
title: Under prefers-reduced-motion, a page holds still with no input, runs no animation longer than 200 ms and does not smooth-scroll
applies_when:
  - adding an animation, transition, parallax, scroll-driven effect, marquee, carousel or autoplaying video to a page
  - adding an animation library or a scroll story to a site
tags: [accessibility, reduced-motion, animation, prefers-reduced-motion, page-suite]
---

The page suite's `motion` test sets `page.emulateMedia({ reducedMotion: 'reduce' })` and visits every page at both widths, in one colour scheme:

- Still: at each viewport-height scroll position, after the page settles, two screenshots taken one second apart with no input are identical. This catches CSS, Web Animations, requestAnimationFrame, canvas and video alike.
- Short: after scrolling to the bottom and back, `document.getAnimations()` holds no animation with infinite iterations, none with an active duration over 200 ms, and none on a scroll or view timeline.
- No smooth scroll: the root's computed `scroll-behavior` is `auto`.

Gate the motion itself on the preference in the source (`@media (prefers-reduced-motion: no-preference)`, or the animation library's reduced-motion hook), so the reduced page is the default and motion is added.

```css
/* WRONG: the loop runs for everyone */
.logos { animation: marquee 30s linear infinite; }
/* RIGHT */
@media (prefers-reduced-motion: no-preference) { .logos { animation: marquee 30s linear infinite; } }
```

Gate: the page suite's `motion` test fails on a changed screenshot, a long or infinite or scroll-driven animation, or smooth scrolling.
