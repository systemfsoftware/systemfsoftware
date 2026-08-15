const fs = require("fs");
const path = require("path");

const { readSlides } = require("./slides-metadata.cjs");

const WEBSITE_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(WEBSITE_ROOT, "public", "slides-static");
const THEME_FILE = path.join(
  WEBSITE_ROOT,
  "src",
  "slides",
  "themes",
  "ttsc.css",
);

async function main() {
  const { marpCli } = await import("@marp-team/marp-cli");
  const slides = readSlides();

  fs.rmSync(OUTPUT_DIR, { force: true, recursive: true });
  for (const slide of slides) {
    const output = path.join(OUTPUT_DIR, slide.slug, "index.html");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const status = await marpCli([
      slide.file,
      "--output",
      output,
      "--html",
      "--theme-set",
      THEME_FILE,
      "--no-config-file",
    ]);
    if (status !== 0)
      throw new Error(`Marp failed to compile ${slide.file} (exit ${status}).`);
  }
  console.log(
    `[build:slides] wrote ${slides.length} deck(s) to ${path.relative(
      WEBSITE_ROOT,
      OUTPUT_DIR,
    )}`,
  );
}

if (require.main === module) main().catch(fail);

function fail(error) {
  console.error(error);
  process.exitCode = 1;
}
