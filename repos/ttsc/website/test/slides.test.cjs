const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const { readSlides } = require("../build/slides-metadata.cjs");

/**
 * Verifies website export: every declared slide has one navigable deck and one
 * social card.
 *
 * The list page, dynamic route, and Marp output read the same frontmatter, so
 * this assertion checks the exported consequence rather than trusting three
 * source-only integrations that could drift independently.
 *
 * 1. Read every source deck and the exported slides index.
 * 2. Assert each card links to a generated Marp presentation with its own image.
 * 3. Assert each route exports the deck-specific title, summary, and Open Graph
 *    image.
 */
test("static slide routes publish their decks and social metadata", () => {
  const websiteRoot = path.resolve(__dirname, "..");
  const outputRoot = path.join(websiteRoot, "out");
  const indexHtml = fs.readFileSync(
    path.join(outputRoot, "slides", "index.html"),
    "utf8",
  );
  const slides = readSlides();

  assert.deepEqual(slides.map((slide) => slide.slug).sort(), [
    "evidence",
    "graph",
  ]);
  for (const slide of slides) {
    const source = fs.readFileSync(slide.file, "utf8");
    const deckHtml = fs.readFileSync(
      path.join(outputRoot, "slides-static", slide.slug, "index.html"),
      "utf8",
    );
    const routeHtml = fs.readFileSync(
      path.join(outputRoot, "slides", slide.slug, "index.html"),
      "utf8",
    );

    assert.match(indexHtml, new RegExp(`href="${slide.route}/?"`));
    assert.ok(indexHtml.includes(slide.description));
    assert.ok(indexHtml.includes(new URL(slide.image).pathname));
    assert.match(deckHtml, /data-bespoke-marp/);
    assert.ok(deckHtml.includes(slide.title));
    assert.ok(routeHtml.includes(slide.staticRoute));
    assert.ok(routeHtml.includes(slide.description));
    assert.ok(routeHtml.includes(slide.image));
    if (slide.slug === "evidence")
      assert.doesNotMatch(
        source,
        /[가-힣]/,
        "evidence.md must stay in English",
      );
  }
});
