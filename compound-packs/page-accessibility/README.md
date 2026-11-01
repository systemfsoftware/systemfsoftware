# Page Accessibility

How the built pages of a static or island site (Astro pages with React islands, or any site Storybook cannot render whole) are proven accessible: every public page as built, in a real browser, in each colour scheme it ships and at 320 and 1280 CSS px wide, against axe at WCAG 2.2 AA plus best-practice, against the checks axe cannot make, and against hand-written snapshots of its key regions' accessibility tree. Work that builds, restyles or tests a page of such a site must honor it. Components and islands stay under the ui-testing pack.

Rules are top-level `.md` files with `title`, `applies_when` and `tags`, cited as `(pack: page-accessibility, <file>.md)`. Subfolders are storage the resolver never reads. Unlike the other packs, each rule here names a test and ends with a `Gate:` line saying which check of the page suite, or which review judgment, proves it: the owner asked for the landing page to be accessibility-tested, colour contrast included, the way Storybook tests stories.

## The page suite

One Playwright Test suite in the site's E2E package runs against the served build output. Its checks, each a test per page:

| Check           | Matrix                             | Rule                                                                |
| --------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `axe`           | scheme × width                     | `built-pages-pass-axe-in-every-scheme-and-width.md`                 |
| `contrast`      | scheme × width                     | `contrast-axe-cannot-compute-is-reviewed-or-measured.md`            |
| `keyboard`      | width                              | `every-control-is-reached-and-operated-by-keyboard.md`              |
| `focus`         | scheme × width, and forced colours | `focus-is-visible-and-never-hidden.md`                              |
| `pointer`       | width                              | `pointer-targets-are-24-px-and-dragging-has-a-click-alternative.md` |
| `reflow`        | once, at 320                       | `pages-survive-200-percent-zoom-reflow-and-text-spacing.md`         |
| `text`          | once, at 200% zoom and spacing     | `pages-survive-200-percent-zoom-reflow-and-text-spacing.md`         |
| `motion`        | width, reduced and no preference   | `motion-honours-reduced-motion-and-can-be-paused.md`                |
| `forced-colors` | width, forced colours              | `forced-colors-keep-every-control-and-state-visible.md`             |
| `structure`     | once                               | `a-page-has-one-h1-a-unique-title-and-a-skip-link.md`               |
| `alternatives`  | once                               | `images-and-graphics-state-what-they-show.md`                       |
| `forms`         | width                              | `form-fields-are-labelled-announce-errors-and-accept-autofill.md`   |
| `aria-snapshot` | width                              | `key-regions-pin-their-accessibility-tree.md`                       |

Which CI lane runs the suite is workflow configuration and carries no rule (testing pack: configuration-gets-no-test-and-no-gate.md). It is a browser suite, so it runs where the repository runs its Storybook and other browser suites.
