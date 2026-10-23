---
title: Four different directions and one reference image per section come before any implementation code
applies_when:
  - an agent starts building a new page, screen or visual redesign
  - a UI unit goes straight from a brief to implementation code
  - reviewing a design whose only visual source is the model's own first idea
tags: [ui-craft, magic-patterns, directions, references, imagegen]
---

A builder that codes from words alone commits to its first idea, and the first idea of a language model is the common layout. Four directions force a choice, and images fix what "good" looks like before the code can drift.

Implementation starts only after two artefacts exist, both committed before the first implementation commit:

- **`directions.md`** holds four directions that differ in idea (what the opening shows, what moves, what carries the page), not in colour, each with a link and one line, then a chosen direction and the reason it beats the other three for the brief's purpose. Four palettes of one layout is one direction.
- **`refs/`** holds one generated image per section of the chosen direction, each saved with its exact prompt. Section here means a screen-sized region a person scrolls to, such as the opening, the example, pricing or the access form.

The build reads the brief, `directions.md`, `refs/` and the design system, and its score file compares each reference image with the matching rendered capture and names what differs.

Evidence. The landing run produced four directions, five section references, and an Astro build of the connected-field direction, with a reference-versus-render table in `score.md`.

Gate: `review` — Is there a `directions.md` with four directions that differ in idea and a stated choice, a `refs/` image per section with its prompt, and a commit order in which these precede the first implementation commit?
