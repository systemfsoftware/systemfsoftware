---
title: Four different directions and one reference image per section come before any implementation code
applies_when:
  - an agent starts building a new page, screen or visual redesign
  - a UI unit goes straight from a brief to implementation code
  - reviewing a design whose only visual source is the model's own first idea
tags: [ui-craft, magic-patterns, directions, references, imagegen]
---

Implementation starts only after two artefacts exist: a directions file and a set of reference images. A builder that codes from words alone commits to its first idea, and the first idea of a language model is the common layout. Four directions force a choice, and images fix what "good" looks like before the code can drift.

1. **Four directions.** Use the Magic Patterns `inspiration` skill, with the product's design system as the brand baseline, to produce four directions that differ in idea (what the opening shows, what moves, what carries the page), not in colour. Save the link and one line per direction in `directions.md`, then a chosen direction and the reason it beats the other three for the brief's purpose. Four palettes of one layout is one direction.
2. **Reference images.** For each section of the chosen direction, generate one image (Codex image generation, `mengto-codex-gpt-image-2-5-flare`'s recipe) and save it with its exact prompt under `refs/`. Upload them to Magic Patterns (`upload-to-magic-patterns`) so the build step reads the same images. Section here means a screen-sized region a person scrolls to, such as the opening, the example, pricing or the access form.
3. **Then build**, from the images, with Codex `gpt-6-astra` at `xhigh` reading the brief, `directions.md`, `refs/` and the design system. Magic Patterns output is brought in with `integrate-magic-patterns-design`, and rebuilt as raw HTML or the repository's components with `recreate-as-raw-html`, never pasted.
4. **Reference comparison.** The score file compares each reference image with the matching rendered capture and names what differs.

Evidence. The landing run produced four directions with `inspiration`, five section references, and an Astro build of the connected-field direction, with a reference-versus-render table in `score.md`.

Gate: `review` — Is there a `directions.md` with four directions that differ in idea and a stated choice, a `refs/` image per section with its prompt, and a commit order in which these precede the first implementation commit?
