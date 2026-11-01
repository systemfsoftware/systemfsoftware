---
title: A page honours prefers-reduced-motion, and any motion that starts by itself and lasts more than 5 seconds has a control to pause, stop or hide it
applies_when:
  - adding an animation, transition, parallax, scroll-driven effect, marquee, carousel or autoplaying video to a page
  - adding an animation library or a scroll story to a site
tags: [accessibility, reduced-motion, animation, pause-stop-hide, prefers-reduced-motion, page-suite]
---

Put non-essential motion behind the preference in the source (`@media (prefers-reduced-motion: no-preference)`, or the animation library's reduced-motion hook; WCAG technique C39), so the reduced page is the default and motion is added to it. The page suite's `motion` test visits every page at both widths:

- Reduced (C39): with `page.emulateMedia({ reducedMotion: 'reduce' })`, at each viewport-height scroll position after the page settles, two screenshots taken one second apart with no input are identical, `document.getAnimations()` holds no animation with infinite iterations or on a scroll or view timeline, and the root's computed `scroll-behavior` is `auto`.
- Pause, stop, hide (WCAG 2.2.2): with no preference set, every animation that starts without input and runs longer than 5 seconds (infinite iterations, or an active duration over 5000 ms), and every autoplaying video or carousel, has a keyboard-reachable control in its region; activating it makes two screenshots of that region one second apart identical.

```css
/* WRONG: the loop runs for everyone, with no way to stop it */
.logos { animation: marquee 30s linear infinite; }
/* RIGHT: added only for people who did not ask for less motion, beside a pause button that sets animation-play-state */
@media (prefers-reduced-motion: no-preference) { .logos { animation: marquee 30s linear infinite; } }
```

Gate: the page suite's `motion` test fails on movement under reduced motion, an infinite or scroll-driven animation, smooth scrolling, or automatic motion over 5 seconds with no working pause control.
